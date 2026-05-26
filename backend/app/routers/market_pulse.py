import threading
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db, SessionLocal
from app.models import Ticker, Watchlist, PriceSnapshot
from app.schemas.market_pulse import MarketPulseResponse, TickerSummary, PostCard, NewsItem
from app.services import yfinance_service as yf_svc
from app.services import reddit_service as reddit_svc
from app.services import finnhub_service as fh_svc
from app.services.sentiment_service import score_text
from app.services.hype_calculator import get_latest_hype, hype_label
from app.services.ticker_utils import normalize_symbol
from app.ml.feature_engineering import build_full_feature_row
from app.ml import inference

router = APIRouter(prefix="/api/v1/market-pulse", tags=["market-pulse"])


def _bg_fetch_prices(symbol: str) -> None:
    """Fire-and-forget yfinance fetch in a daemon thread so it never blocks a request."""
    def _work():
        db = SessionLocal()
        try:
            n = yf_svc.fetch_and_store_prices(db, symbol, period="5d", interval="1h")
            if not n:
                n = yf_svc.fetch_and_store_prices(db, symbol, period="1mo", interval="1d")
            print(f"[bg_fetch] {symbol}: +{n} rows stored")
        except Exception as e:
            print(f"[bg_fetch] {symbol} error: {e}")
        finally:
            db.close()

    t = threading.Thread(target=_work, daemon=True)
    t.start()


def _auto_seed_ticker(db: Session, symbol: str) -> Ticker:
    """
    Ensure the ticker exists and schedule a background price refresh when stale.
    The yfinance fetch is NEVER awaited inline — it runs in a daemon thread so
    the API response is always fast.  Live fallbacks (get_live_price / Finnhub)
    cover the gap until the background write completes.
    """
    symbol = normalize_symbol(symbol)   # shared util: '2330' → '2330.TW'
    ticker = db.execute(select(Ticker).where(Ticker.symbol == symbol)).scalar_one_or_none()

    # If ticker is brand-new, create a placeholder row immediately (fast DB write)
    if ticker is None:
        ticker = yf_svc._get_or_create_ticker(db, symbol)
        if ticker is None:
            raise HTTPException(status_code=404,
                                detail=f"Ticker '{symbol}' not found. Check the symbol and try again.")
        _bg_fetch_prices(symbol)      # populate prices in background

    else:
        # Check whether our price data is stale (no row in the last 6 hours)
        cutoff = datetime.utcnow() - timedelta(hours=6)
        recent = db.execute(
            select(PriceSnapshot)
            .where(PriceSnapshot.ticker_id == ticker.id, PriceSnapshot.ts >= cutoff)
            .limit(1)
        ).scalar_one_or_none()
        if not recent:
            print(f"[market_pulse] Stale prices for {symbol} — refreshing in background")
            _bg_fetch_prices(symbol)  # non-blocking

    # Auto-add to watchlist
    existing_wl = db.execute(select(Watchlist).where(Watchlist.symbol == symbol)).scalar_one_or_none()
    if not existing_wl:
        db.add(Watchlist(symbol=symbol))
        db.commit()
    return ticker


@router.get("/", response_model=list[TickerSummary])
def list_watchlist_tickers(db: Session = Depends(get_db)):
    watchlist = db.execute(select(Watchlist)).scalars().all()
    results = []
    for wl in watchlist:
        ticker = db.execute(select(Ticker).where(Ticker.symbol == wl.symbol)).scalar_one_or_none()
        if not ticker:
            continue
        hype = get_latest_hype(db, ticker.id)
        price_change = yf_svc.get_price_change_pct(db, ticker.id, hours=24)
        results.append(TickerSummary(
            symbol=ticker.symbol,
            name=ticker.name,
            hype_score=float(hype.hype_score) if hype else 0.0,
            hype_label=hype_label(float(hype.hype_score) if hype else 0.0),
            price_change_pct=round(price_change * 100, 2),
        ))
    return results


@router.get("/{ticker_symbol}", response_model=MarketPulseResponse)
def get_market_pulse(ticker_symbol: str, db: Session = Depends(get_db)):
    ticker = _auto_seed_ticker(db, ticker_symbol)
    hype = get_latest_hype(db, ticker.id)

    is_tw = ticker.symbol.endswith(".TW")

    # ── Price: fastest reliable source first ──────────────────────────────────
    latest_price = None

    if not is_tw:
        # US stocks: Finnhub quote is fast and reliable
        fh_q = fh_svc.get_quote(ticker.symbol)
        if fh_q and fh_q.get("price", 0) > 0:
            latest_price = {
                "close": fh_q["price"],
                "volume": 0,
                "ts": datetime.utcnow(),
                "_fh_change_pct": fh_q.get("change_pct", 0.0),
            }
    else:
        # Taiwan stocks: TWSE public API (free, no key needed)
        latest_price = yf_svc.get_twse_price(ticker.symbol)

    # Fall back to DB snapshot
    if not latest_price or latest_price.get("close", 0) == 0.0:
        db_price = yf_svc.get_latest_price(db, ticker.id)
        if db_price and db_price["close"] > 0:
            latest_price = db_price

    # Last resort: yfinance live
    if not latest_price or latest_price.get("close", 0) == 0.0:
        live = yf_svc.get_live_price(ticker.symbol)
        if live and live["close"] > 0:
            latest_price = live

    # ── Price history: DB → Yahoo direct → Finnhub candles ────────────────────
    price_history = yf_svc.get_price_history(db, ticker.id, hours=24)
    if not price_history:
        price_history = yf_svc.get_price_history(db, ticker.id, hours=5 * 24)
    if not price_history:
        price_history = yf_svc.get_yahoo_chart_direct(ticker.symbol, days=5)
    if not price_history and not is_tw:
        price_history = fh_svc.get_candles(ticker.symbol, days=5)

    # Fill volume from history if Finnhub quote gave 0
    if latest_price and latest_price.get("volume", 0) == 0 and price_history:
        last_vol = next((p["volume"] for p in reversed(price_history) if p.get("volume", 0) > 0), 0)
        latest_price = {**latest_price, "volume": last_vol}

    # ── 24h price change ──────────────────────────────────────────────────────
    fh_change_pct = latest_price.get("_fh_change_pct") if latest_price else None
    if fh_change_pct is not None:
        price_change_24h = fh_change_pct / 100.0  # Finnhub gives % as float e.g. 2.5
    else:
        price_change_24h = yf_svc.get_price_change_pct(db, ticker.id, hours=24)
        if price_change_24h == 0.0:
            price_change_24h = yf_svc.get_price_change_pct(db, ticker.id, hours=5 * 24)
        if price_change_24h == 0.0 and len(price_history) >= 2:
            first_close = price_history[0]["close"]
            last_close = price_history[-1]["close"]
            if first_close > 0:
                price_change_24h = (last_close - first_close) / first_close

    volume_spike = yf_svc.get_volume_spike(db, ticker.id)
    if volume_spike == 1.0 and price_history:
        vols = [p["volume"] for p in price_history if p.get("volume", 0) > 0]
        if len(vols) >= 2:
            avg_vol = sum(vols[:-1]) / len(vols[:-1])
            if avg_vol > 0:
                volume_spike = round(vols[-1] / avg_vol, 2)

    recent_posts = reddit_svc.get_recent_mentions(db, ticker.id, hours=24, limit=5)
    sentiment_stats = reddit_svc.get_sentiment_stats(db, ticker.id, hours=24)

    hs_val = float(hype.hype_score) if hype else 0.0

    # ── ML probabilities: live inference when we have signal data ─────────────
    # We always run inference rather than reconstructing 3-class probs from a
    # single stored probability (which was misleading — the other two classes
    # were set to (1-p)/2 arbitrarily).
    mention_24h = int(sentiment_stats.get("count", 0))
    if hype:
        mention_24h = max(mention_24h, int(hype.mention_count_24h or 0))

    has_signal = (
        mention_24h > 0
        or volume_spike != 1.0
        or (price_change_24h != 0.0)
    )

    ml_probs: list[float]
    ml_data_quality: str
    if has_signal:
        try:
            br  = float(hype.bullish_ratio)  if hype else sentiment_stats.get("bullish_ratio", 0.5)
            sa  = float(hype.avg_sentiment)  if hype else sentiment_stats.get("avg_sentiment", 0.0)
            mc1h = max(1, mention_24h // 24)
            # Aggregate recent post text so text_features use real language signals
            recent_text = " ".join(
                p.body_snippet for p in recent_posts if p.body_snippet
            )
            feat = build_full_feature_row(
                mention_count_1h=mc1h,
                mention_count_24h=max(1, mention_24h),
                mention_growth_ratio=max(1.0, mention_24h / 10.0),
                bullish_ratio=br,
                avg_sentiment=sa,
                influencer_score=min(float(sentiment_stats.get("influencer_score", 0)) / 50.0, 1.0),
                price_change_pct_1h=price_change_24h / 24,
                price_change_pct_24h=price_change_24h,
                volume_spike_ratio=volume_spike,
                short_interest_ratio=0.1,
                option_volume_spike=min(volume_spike * 0.4, 5.0),
                post_text=recent_text,
            )
            risk_result = inference.predict_risk(feat)
            ml_probs = [round(p, 4) for p in risk_result["probabilities"]]
            ml_data_quality = "live"
        except Exception:
            ml_probs = [1/3, 1/3, 1/3]
            ml_data_quality = "insufficient"
    elif hype and hype.ml_risk_label is not None:
        # Stored label + single prob — mark as estimated so UI can caveat it
        lbl  = int(hype.ml_risk_label)
        prob = float(hype.ml_risk_prob or 0.5)
        ml_probs = [0.0, 0.0, 0.0]
        ml_probs[lbl] = prob
        rem = (1 - prob) / 2
        for i in range(3):
            if i != lbl:
                ml_probs[i] = rem
        ml_data_quality = "estimated"
    else:
        ml_probs = [1/3, 1/3, 1/3]
        ml_data_quality = "insufficient"

    top_posts = [
        PostCard(
            post_id=p.post_id,
            body_snippet=p.body_snippet or "",
            author=p.author or "unknown",
            score=p.score or 0,
            sentiment=float(p.sentiment_score or 0),
            is_bullish=bool(p.is_bullish),
            url=p.url or "",
            ts=p.ts,
        )
        for p in recent_posts
    ]

    # Prefer Finnhub news (richer, more sources); fall back to yfinance
    fh_news = fh_svc.get_news(ticker.symbol, limit=6)
    if fh_news:
        news_items = [
            NewsItem(
                title=n["headline"],
                publisher=n["source"],
                link=n["url"],
                published_at=n["published_at"],
                sentiment_score=round(score_text(n["headline"] + " " + n["summary"]), 4),
            )
            for n in fh_news
            if n.get("headline")
        ]
    else:
        raw_news = yf_svc.fetch_news_with_sentiment(ticker.symbol, limit=5)
        news_items = [
            NewsItem(
                title=n["title"],
                publisher=n["publisher"],
                link=n["link"],
                published_at=n["published_at"],
                sentiment_score=n["sentiment_score"],
            )
            for n in raw_news
        ]

    # Enrich sentiment stats with Finnhub social data when local DB is sparse
    fh_social = fh_svc.get_social_sentiment(ticker.symbol)
    if fh_social and (sentiment_stats["avg_sentiment"] == 0.0 or hype is None):
        fh_reddit_sent = fh_social.get("reddit_sentiment", 0.0)
        fh_twitter_sent = fh_social.get("twitter_sentiment", 0.0)
        blended_sentiment = (fh_reddit_sent + fh_twitter_sent) / 2 if (fh_reddit_sent or fh_twitter_sent) else 0.0
        if blended_sentiment != 0.0:
            sentiment_stats["avg_sentiment"] = round(blended_sentiment, 4)
            sentiment_stats["bullish_ratio"] = round(0.5 + blended_sentiment * 0.5, 3)

    # updated_at: timestamp of the most recent price datapoint (or now if live)
    updated_at = latest_price["ts"] if latest_price else None

    # Strip internal helper key before building response
    if latest_price and "_fh_change_pct" in latest_price:
        latest_price = {k: v for k, v in latest_price.items() if k != "_fh_change_pct"}

    return MarketPulseResponse(
        ticker=ticker.symbol,
        price=latest_price["close"] if latest_price else None,
        price_change_pct=round(price_change_24h * 100, 2) if price_change_24h is not None else None,
        volume=latest_price["volume"] if latest_price else None,
        volume_spike_ratio=round(volume_spike, 2) if volume_spike != 1.0 else None,
        hype_score=hs_val,
        hype_label=hype_label(hs_val),
        mention_count_1h=hype.mention_count_1h if hype else 0,
        mention_count_24h=hype.mention_count_24h if hype else 0,
        bullish_ratio=float(hype.bullish_ratio) if hype else sentiment_stats["bullish_ratio"],
        avg_sentiment=float(hype.avg_sentiment) if hype else sentiment_stats["avg_sentiment"],
        top_drivers=hype.top_drivers if hype else ["No data"],
        ml_risk_prob=ml_probs,
        ml_data_quality=ml_data_quality,
        top_posts=top_posts,
        price_history_24h=[
            {"ts": p["ts"], "close": p["close"], "volume": p["volume"]}
            for p in price_history
        ],
        news_items=news_items,
        updated_at=updated_at,
    )
