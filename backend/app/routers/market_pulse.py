from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db
from app.models import Ticker, Watchlist
from app.schemas.market_pulse import MarketPulseResponse, TickerSummary, PostCard, NewsItem
from app.services import yfinance_service as yf_svc
from app.services import reddit_service as reddit_svc
from app.services import finnhub_service as fh_svc
from app.services.sentiment_service import score_text
from app.services.hype_calculator import get_latest_hype, hype_label

router = APIRouter(prefix="/api/v1/market-pulse", tags=["market-pulse"])


def _auto_seed_ticker(db: Session, symbol: str) -> Ticker:
    """
    Fetch ticker data from yfinance.
    For NEW tickers: always fetch.
    For EXISTING tickers: re-fetch if no price data in last 3 hours
    (handles stale DB after deployment, weekends, etc.).
    """
    from datetime import datetime, timedelta
    from app.models import PriceSnapshot
    from sqlalchemy import select as sa_select

    symbol = symbol.upper()
    ticker = db.execute(sa_select(Ticker).where(Ticker.symbol == symbol)).scalar_one_or_none()

    needs_fetch = ticker is None
    if ticker and not needs_fetch:
        # Check if we have any price data in the last 3 hours
        cutoff = datetime.utcnow() - timedelta(hours=3)
        recent = db.execute(
            sa_select(PriceSnapshot)
            .where(PriceSnapshot.ticker_id == ticker.id, PriceSnapshot.ts >= cutoff)
            .limit(1)
        ).scalar_one_or_none()
        if not recent:
            needs_fetch = True
            print(f"[market_pulse] No recent prices for {symbol}, re-fetching...")

    if needs_fetch:
        try:
            inserted = yf_svc.fetch_and_store_prices(db, symbol, period="5d", interval="1h")
            print(f"[market_pulse] fetch_and_store_prices(5d/1h) for {symbol}: +{inserted} rows")
            if inserted == 0:
                inserted = yf_svc.fetch_and_store_prices(db, symbol, period="1mo", interval="1d")
                print(f"[market_pulse] fetch_and_store_prices(1mo/1d) for {symbol}: +{inserted} rows")
        except Exception as e:
            print(f"[market_pulse] yfinance fetch error for {symbol}: {e}")

    ticker = db.execute(sa_select(Ticker).where(Ticker.symbol == symbol)).scalar_one_or_none()
    if not ticker:
        raise HTTPException(status_code=404, detail=f"Ticker '{symbol}' not found. Check the symbol and try again.")

    # Auto-add to watchlist
    existing_wl = db.execute(sa_select(Watchlist).where(Watchlist.symbol == symbol)).scalar_one_or_none()
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

    # ── Price: DB first, live yfinance as fallback ──────────────────────────
    latest_price = yf_svc.get_latest_price(db, ticker.id)
    if not latest_price or latest_price["close"] == 0.0:
        print(f"[market_pulse] DB price empty for {ticker.symbol} — fetching live")
        latest_price = yf_svc.get_live_price(ticker.symbol)

    # ── Price history: DB → 5-day DB → live yfinance ────────────────────────
    price_history = yf_svc.get_price_history(db, ticker.id, hours=24)
    if not price_history:
        price_history = yf_svc.get_price_history(db, ticker.id, hours=5 * 24)
    if not price_history:
        print(f"[market_pulse] DB history empty for {ticker.symbol} — fetching live")
        price_history = yf_svc.get_live_history(ticker.symbol, days=5)

    # ── 24h price change: DB → 5-day DB → derive from available history ─────
    price_change_24h = yf_svc.get_price_change_pct(db, ticker.id, hours=24)
    if price_change_24h == 0.0:
        price_change_24h = yf_svc.get_price_change_pct(db, ticker.id, hours=5 * 24)
    if price_change_24h == 0.0 and len(price_history) >= 2:
        first_close = price_history[0]["close"]
        last_close = price_history[-1]["close"]
        if first_close > 0:
            price_change_24h = (last_close - first_close) / first_close

    volume_spike = yf_svc.get_volume_spike(db, ticker.id)
    # If DB had < 10 rows the spike defaults to 1.0; derive from live history instead
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
