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
    symbol = symbol.upper()
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

    # ── Price: DB → live yfinance → Finnhub quote ───────────────────────────
    latest_price = yf_svc.get_latest_price(db, ticker.id)
    if not latest_price or latest_price["close"] == 0.0:
        print(f"[market_pulse] DB price empty for {ticker.symbol} — trying live yfinance")
        latest_price = yf_svc.get_live_price(ticker.symbol)
    if not latest_price or latest_price["close"] == 0.0:
        print(f"[market_pulse] yfinance live failed for {ticker.symbol} — trying Finnhub quote")
        fh_q = fh_svc.get_quote(ticker.symbol)
        if fh_q:
            latest_price = {"close": fh_q["price"], "volume": fh_q.get("volume", 0), "ts": datetime.utcnow()}

    # ── Price history: DB (24h) → DB (5-day) → yfinance live → Finnhub candles
    price_history = yf_svc.get_price_history(db, ticker.id, hours=24)
    if not price_history:
        price_history = yf_svc.get_price_history(db, ticker.id, hours=5 * 24)
    if not price_history:
        print(f"[market_pulse] DB history empty for {ticker.symbol} — trying live yfinance")
        price_history = yf_svc.get_live_history(ticker.symbol, days=5)
    if not price_history:
        print(f"[market_pulse] yfinance history failed for {ticker.symbol} — trying Finnhub candles")
        price_history = fh_svc.get_candles(ticker.symbol, days=5)

    # ── 24h price change: DB → 5-day DB → Finnhub → derive from history ─────
    price_change_24h = yf_svc.get_price_change_pct(db, ticker.id, hours=24)
    if price_change_24h == 0.0:
        price_change_24h = yf_svc.get_price_change_pct(db, ticker.id, hours=5 * 24)
    if price_change_24h == 0.0:
        fh_q = fh_svc.get_quote(ticker.symbol)
        if fh_q and fh_q.get("change_pct"):
            price_change_24h = fh_q["change_pct"] / 100
    if price_change_24h == 0.0 and len(price_history) >= 2:
        first_close = price_history[0]["close"]
        last_close = price_history[-1]["close"]
        if first_close > 0:
            price_change_24h = (last_close - first_close) / first_close

    volume_spike = yf_svc.get_volume_spike(db, ticker.id)
    # Derive from live history when DB has < 10 rows
    if volume_spike == 1.0 and price_history:
        vols = [p["volume"] for p in price_history if p["volume"] > 0]
        if len(vols) >= 2:
            avg_vol = sum(vols[:-1]) / len(vols[:-1])
            if avg_vol > 0:
                volume_spike = round(vols[-1] / avg_vol, 2)

    recent_posts = reddit_svc.get_recent_mentions(db, ticker.id, hours=24, limit=5)
    sentiment_stats = reddit_svc.get_sentiment_stats(db, ticker.id, hours=24)

    hs_val = float(hype.hype_score) if hype else 0.0
    ml_probs = [0.5, 0.35, 0.15]
    if hype and hype.ml_risk_label is not None:
        label = hype.ml_risk_label
        prob = float(hype.ml_risk_prob or 0.5)
        ml_probs = [0.0, 0.0, 0.0]
        ml_probs[label] = prob
        remaining = (1 - prob) / 2
        for i in range(3):
            if i != label:
                ml_probs[i] = remaining

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

    return MarketPulseResponse(
        ticker=ticker.symbol,
        price=latest_price["close"] if latest_price else 0.0,
        price_change_pct=round(price_change_24h * 100, 2),
        volume=latest_price["volume"] if latest_price else 0,
        volume_spike_ratio=round(volume_spike, 2),
        hype_score=hs_val,
        hype_label=hype_label(hs_val),
        mention_count_1h=hype.mention_count_1h if hype else 0,
        mention_count_24h=hype.mention_count_24h if hype else 0,
        bullish_ratio=float(hype.bullish_ratio) if hype else sentiment_stats["bullish_ratio"],
        avg_sentiment=float(hype.avg_sentiment) if hype else sentiment_stats["avg_sentiment"],
        top_drivers=hype.top_drivers if hype else ["No data"],
        ml_risk_prob=ml_probs,
        top_posts=top_posts,
        price_history_24h=[
            {"ts": p["ts"], "close": p["close"], "volume": p["volume"]}
            for p in price_history
        ],
        news_items=news_items,
        updated_at=updated_at,
    )
