"""
Market Screener router.
Hype scores are computed in REAL-TIME on each request using live yfinance data
and Finnhub news/social signals — not pulled from stale DB snapshots.
"""
import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.database import get_db
from app.models import Ticker, Watchlist
from app.services.hype_calculator import get_latest_hype, hype_label
from app.services import yfinance_service as yf_svc
from app.services import finnhub_service as fh_svc
from app.services.trending_service import get_trending_tickers
from app.ml import inference
from app.ml.feature_engineering import build_feature_row

router = APIRouter(tags=["screener"])

_ML_RISK_TEXT = {0: "低", 1: "中", 2: "高"}


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
    mention_count_24h: int = 0
    currency: str = "USD"


def _realtime_score(symbol: str, db: Session, ticker_id: int) -> dict:
    """
    Compute a fully real-time hype score from live signals.
    Uses yfinance (price/volume) + Finnhub (news + social).
    Taiwan stocks (.TW) skip Finnhub social and use yfinance signals only.
    """
    is_tw = symbol.endswith(".TW")
    base_symbol = symbol.replace(".TW", "")   # Finnhub uses bare symbol

    # ── yfinance signals (DB first; live fallback if DB empty) ────────────────
    volume_spike  = yf_svc.get_volume_spike(db, ticker_id) or 1.0
    price_chg_24h = yf_svc.get_price_change_pct(db, ticker_id, hours=24) or 0.0
    price_chg_5d  = yf_svc.get_price_change_pct(db, ticker_id, hours=120) or 0.0

    # If DB has no data, derive from live history
    if price_chg_24h == 0.0 or volume_spike == 1.0:
        live_hist = yf_svc.get_live_history(symbol, days=5)
        if live_hist and len(live_hist) >= 2:
            if price_chg_24h == 0.0:
                f = live_hist[0]["close"]
                l = live_hist[-1]["close"]
                if f > 0:
                    price_chg_24h = (l - f) / f
            if volume_spike == 1.0:
                vols = [p["volume"] for p in live_hist if p["volume"] > 0]
                if len(vols) >= 2:
                    avg_v = sum(vols[:-1]) / len(vols[:-1])
                    if avg_v > 0:
                        volume_spike = vols[-1] / avg_v

    # ── Finnhub signals (US stocks only) ─────────────────────────────────────
    news_count       = 0
    social_mentions  = 0
    social_sentiment = 0.0

    if not is_tw:
        try:
            fh_news = fh_svc.get_news(base_symbol, limit=10)
            news_count = len(fh_news)
        except Exception:
            pass
        try:
            fh_s = fh_svc.get_social_sentiment(base_symbol)
            if fh_s:
                social_mentions = (fh_s.get("reddit_mentions", 0) or 0) + \
                                  (fh_s.get("twitter_mentions", 0) or 0)
                r = fh_s.get("reddit_sentiment", 0.0) or 0.0
                t = fh_s.get("twitter_sentiment", 0.0) or 0.0
                n = sum(1 for x in [r, t] if x != 0.0)
                social_sentiment = (r + t) / n if n > 0 else 0.0
        except Exception:
            pass

    # ── Composite hype score (0–100) ─────────────────────────────────────────
    # Volume spike:    0–30 pts  (5× spike = max)
    # Price movement:  0–25 pts  (10 % 5-day move = max)
    # News activity:   0–20 pts  (10 articles = max)
    # Social mentions: 0–15 pts  (100 weekly mentions = max)
    # Sentiment:       0–10 pts
    vol_pts    = min(volume_spike / 5.0,      1.0) * 30
    price_pts  = min(abs(price_chg_5d) * 10,  1.0) * 25
    news_pts   = min(news_count / 10.0,        1.0) * 20
    social_pts = min(social_mentions / 100.0,  1.0) * 15
    sent_pts   = ((social_sentiment + 1.0) / 2.0) * 10

    hype_score = round(vol_pts + price_pts + news_pts + social_pts + sent_pts, 1)

    # ── ML risk label ─────────────────────────────────────────────────────────
    mention_24h = int(social_mentions / 7) if social_mentions > 0 else 0
    try:
        features = build_feature_row(
            mention_count_1h=max(1, mention_24h // 24),
            mention_count_24h=mention_24h,
            mention_growth_ratio=max(1.0, mention_24h / 10.0),
            bullish_ratio=round(0.5 + social_sentiment * 0.5, 3),
            avg_sentiment=social_sentiment,
            influencer_score=min(social_mentions / 50.0, 1.0),
            price_change_pct_1h=price_chg_24h / 24,
            price_change_pct_24h=price_chg_24h,
            volume_spike_ratio=volume_spike,
            short_interest_ratio=0.1,
            option_volume_spike=min(volume_spike * 0.4, 5.0),
            hour_of_day=datetime.datetime.utcnow().hour,
        )
        risk = inference.predict_risk(features)
        ml_risk_label = risk["label"]
    except Exception:
        ml_risk_label = None

    return {
        "hype_score": hype_score,
        "volume_spike": round(volume_spike, 2),
        "price_change_pct": round(price_chg_24h * 100, 2),
        "mention_count_24h": mention_24h,
        "ml_risk_label": ml_risk_label,
    }


@router.get("/api/v1/screener", response_model=list[ScreenerItem])
def get_screener(db: Session = Depends(get_db)):
    """
    Return all watchlist tickers with REAL-TIME hype scores and ML risk labels.
    """
    watchlist_symbols = {
        w.symbol for w in db.execute(select(Watchlist)).scalars().all()
    }
    tickers = db.execute(
        select(Ticker).where(Ticker.symbol.in_(watchlist_symbols))
    ).scalars().all()

    items: list[ScreenerItem] = []
    for ticker in tickers:
        latest_price = yf_svc.get_latest_price(db, ticker.id)
        if not latest_price or latest_price["close"] == 0.0:
            latest_price = yf_svc.get_live_price(ticker.symbol)
        currency = "TWD" if ticker.symbol.endswith(".TW") else "USD"

        try:
            rt = _realtime_score(ticker.symbol, db, ticker.id)
        except Exception as e:
            print(f"[screener] realtime error for {ticker.symbol}: {e}")
            # Fallback to DB snapshot
            hype = get_latest_hype(db, ticker.id)
            rt = {
                "hype_score": float(hype.hype_score) if hype else None,
                "volume_spike": round(yf_svc.get_volume_spike(db, ticker.id) or 0, 2),
                "price_change_pct": round((yf_svc.get_price_change_pct(db, ticker.id, hours=24) or 0) * 100, 2),
                "mention_count_24h": int(hype.mention_count_24h) if hype else 0,
                "ml_risk_label": int(hype.ml_risk_label) if hype and hype.ml_risk_label is not None else None,
            }

        ml_label = rt.get("ml_risk_label")
        hs_val   = rt.get("hype_score")

        items.append(ScreenerItem(
            symbol=ticker.symbol,
            name=ticker.name,
            hype_score=hs_val,
            hype_label=hype_label(hs_val) if hs_val is not None else None,
            price=float(latest_price["close"]) if latest_price else None,
            price_change_pct=rt.get("price_change_pct"),
            volume_spike=rt.get("volume_spike"),
            ml_risk_label=ml_label,
            ml_risk_text=_ML_RISK_TEXT.get(ml_label) if ml_label is not None else None,
            mention_count_24h=rt.get("mention_count_24h", 0),
            currency=currency,
        ))

    # Sort by hype_score descending, nulls last
    items.sort(key=lambda x: (x.hype_score is None, -(x.hype_score or 0)))
    return items


@router.get("/api/v1/trending")
async def get_trending(limit: int = 10):
    try:
        tickers = await get_trending_tickers(limit=limit)
        return {"trending": tickers}
    except Exception as e:
        print(f"[screener] trending error: {e}")
        return {"trending": []}
