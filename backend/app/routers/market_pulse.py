from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db
from app.models import Ticker, Watchlist
from app.schemas.market_pulse import MarketPulseResponse, TickerSummary, PostCard, NewsItem
from app.services import yfinance_service as yf_svc
from app.services import reddit_service as reddit_svc
from app.services.hype_calculator import get_latest_hype, hype_label

router = APIRouter(prefix="/api/v1/market-pulse", tags=["market-pulse"])


def _auto_seed_ticker(db: Session, symbol: str) -> Ticker:
    """Fetch ticker data from yfinance on first access and store it."""
    symbol = symbol.upper()
    ticker = db.execute(select(Ticker).where(Ticker.symbol == symbol)).scalar_one_or_none()
    if ticker:
        return ticker
    # Auto-fetch price data (5 days hourly for enough data)
    try:
        inserted = yf_svc.fetch_and_store_prices(db, symbol, period="5d", interval="1h")
        if inserted == 0:
            # Try daily data as fallback
            inserted = yf_svc.fetch_and_store_prices(db, symbol, period="1mo", interval="1d")
    except Exception:
        pass
    ticker = db.execute(select(Ticker).where(Ticker.symbol == symbol)).scalar_one_or_none()
    if not ticker:
        raise HTTPException(status_code=404, detail=f"Ticker '{symbol}' not found. Check the symbol and try again.")
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
    latest_price = yf_svc.get_latest_price(db, ticker.id)
    price_history = yf_svc.get_price_history(db, ticker.id, hours=24)
    price_change_24h = yf_svc.get_price_change_pct(db, ticker.id, hours=24)
    volume_spike = yf_svc.get_volume_spike(db, ticker.id)
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
    )
