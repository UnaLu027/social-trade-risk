from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.models import Ticker, Watchlist
from app.services.hype_calculator import get_latest_hype, hype_label
from app.services import yfinance_service as yf_svc
from app.services.trending_service import get_trending_tickers

router = APIRouter(tags=["screener"])

_ML_RISK_TEXT = {0: "Low", 1: "Medium", 2: "High"}


class ScreenerItem(BaseModel):
    symbol: str
    name: Optional[str]
    hype_score: Optional[float]
    hype_label: Optional[str]
    price: Optional[float]
    price_change_pct: Optional[float]
    volume_spike: Optional[float]
    ml_risk_label: Optional[int]
    ml_risk_text: Optional[str]
    mention_count_24h: Optional[int]


@router.get("/api/v1/screener", response_model=list[ScreenerItem])
def get_screener(db: Session = Depends(get_db)):
    """
    Return all watchlist tickers with latest hype scores, prices, and ML risk
    labels, sorted by hype_score descending (nulls last).
    """
    watchlist_symbols = {
        w.symbol for w in db.execute(select(Watchlist)).scalars().all()
    }

    tickers = db.execute(
        select(Ticker).where(Ticker.symbol.in_(watchlist_symbols))
    ).scalars().all()

    items: list[ScreenerItem] = []
    for ticker in tickers:
        hype = get_latest_hype(db, ticker.id)
        latest_price = yf_svc.get_latest_price(db, ticker.id)
        price_change = yf_svc.get_price_change_pct(db, ticker.id, hours=24)
        volume_spike = yf_svc.get_volume_spike(db, ticker.id)

        hs_val = float(hype.hype_score) if hype and hype.hype_score is not None else None
        ml_label = int(hype.ml_risk_label) if hype and hype.ml_risk_label is not None else None

        items.append(
            ScreenerItem(
                symbol=ticker.symbol,
                name=ticker.name,
                hype_score=hs_val,
                hype_label=hype_label(hs_val) if hs_val is not None else None,
                price=float(latest_price["close"]) if latest_price else None,
                price_change_pct=round(price_change * 100, 2) if price_change is not None else None,
                volume_spike=round(volume_spike, 2) if volume_spike is not None else None,
                ml_risk_label=ml_label,
                ml_risk_text=_ML_RISK_TEXT.get(ml_label) if ml_label is not None else None,
                mention_count_24h=int(hype.mention_count_24h) if hype and hype.mention_count_24h is not None else None,
            )
        )

    # Sort by hype_score descending, nulls last
    items.sort(key=lambda x: (x.hype_score is None, -(x.hype_score or 0)))
    return items


@router.get("/api/v1/trending")
async def get_trending(limit: int = 10):
    """
    Return top trending tickers detected from Reddit social chatter across
    multiple subreddits (wallstreetbets, stocks, options, StockMarket).
    """
    try:
        tickers = await get_trending_tickers(limit=limit)
        return {"trending": tickers}
    except Exception as e:
        print(f"[screener] trending error: {e}")
        return {"trending": []}
