"""
Market Screener router.

預設行為（include_live=false）：
  - 純讀 DB（PriceSnapshot + HypeScore），目標 < 3 秒。
  - 美股無 DB 價格時，自動嘗試 Finnhub quick-quote 作為 fallback。
  - 每檔 ticker 獨立 try/except，單一失敗不影響其他標的。

include_live=true 時：
  - 對每檔 ticker 即時呼叫 yfinance + Finnhub news/social 計算 hype score。
  - 可能較慢，建議前端使用 30s 以上 timeout。
"""
import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import select, desc

from app.database import get_db
from app.models import Ticker, Watchlist, HypeScore, PriceSnapshot
from app.services.hype_calculator import hype_label
from app.services import yfinance_service as yf_svc
from app.services import finnhub_service as fh_svc
from app.services.trending_service import get_trending_tickers
from app.ml import inference
from app.ml.feature_engineering import build_full_feature_row

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
    data_quality: str = "unknown"


# ─────────────────────────────────────────────────────────────────────
#  DB helpers
# ─────────────────────────────────────────────────────────────────────

def _db_price(db: Session, ticker_id: int) -> Optional[float]:
    """讀 PriceSnapshot 最新收盤價，失敗回 None。"""
    try:
        row = db.execute(
            select(PriceSnapshot)
            .where(PriceSnapshot.ticker_id == ticker_id)
            .order_by(desc(PriceSnapshot.ts))
            .limit(1)
        ).scalar_one_or_none()
        if row and row.close and float(row.close) > 0:
            return float(row.close)
    except Exception as exc:
        print(f"[screener] db_price error ticker_id={ticker_id}: {exc}")
    return None


def _db_hype(db: Session, ticker_id: int) -> Optional[HypeScore]:
    """讀 HypeScore 最新一筆，失敗回 None。"""
    try:
        return db.execute(
            select(HypeScore)
            .where(HypeScore.ticker_id == ticker_id)
            .order_by(desc(HypeScore.ts))
            .limit(1)
        ).scalar_one_or_none()
    except Exception as exc:
        print(f"[screener] db_hype error ticker_id={ticker_id}: {exc}")
    return None


def _finnhub_price(symbol: str) -> Optional[float]:
    """從 Finnhub get_quote 取現價，Taiwan 股票跳過，失敗回 None。"""
    try:
        q = fh_svc.get_quote(symbol)
        if q and (q.get("price") or 0) > 0:
            return float(q["price"])
    except Exception as exc:
        print(f"[screener] finnhub_price error {symbol}: {exc}")
    return None


# ─────────────────────────────────────────────────────────────────────
#  Realtime score（只在 include_live=True 時呼叫）
# ─────────────────────────────────────────────────────────────────────

def _realtime_score(symbol: str, db: Session, ticker_id: int) -> dict:
    """
    即時計算 hype score（使用 yfinance DB 快取 + Finnhub news/social）。
    Taiwan 股票跳過 Finnhub social。
    """
    is_tw = symbol.endswith(".TW")
    base_symbol = symbol.replace(".TW", "")

    volume_spike  = yf_svc.get_volume_spike(db, ticker_id) or 1.0
    price_chg_24h = yf_svc.get_price_change_pct(db, ticker_id, hours=24) or 0.0
    price_chg_5d  = yf_svc.get_price_change_pct(db, ticker_id, hours=120) or 0.0

    news_count = social_mentions = 0
    social_sentiment = 0.0

    if not is_tw:
        try:
            news_count = len(fh_svc.get_news(base_symbol, limit=10))
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

    vol_pts    = min(volume_spike / 5.0,      1.0) * 30
    price_pts  = min(abs(price_chg_5d) * 10,  1.0) * 25
    news_pts   = min(news_count / 10.0,        1.0) * 20
    social_pts = min(social_mentions / 100.0,  1.0) * 15
    sent_pts   = ((social_sentiment + 1.0) / 2.0) * 10
    hype_score = round(vol_pts + price_pts + news_pts + social_pts + sent_pts, 1)

    has_price_signal  = (volume_spike != 1.0 or abs(price_chg_24h) > 0.001)
    has_social_signal = social_mentions > 0
    if has_price_signal and has_social_signal:
        data_quality = "ok"
    elif has_price_signal or has_social_signal:
        data_quality = "partial"
    else:
        data_quality = "insufficient"

    mention_24h = int(social_mentions / 7) if social_mentions > 0 else 0
    ml_risk_label = None
    try:
        features = build_full_feature_row(
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
        ml_risk_label = inference.predict_risk(features)["label"]
    except Exception:
        pass

    return {
        "hype_score": hype_score,
        "volume_spike": round(volume_spike, 2),
        "price_change_pct": round(price_chg_24h * 100, 2),
        "mention_count_24h": mention_24h,
        "ml_risk_label": ml_risk_label,
        "data_quality": data_quality,
    }


# ─────────────────────────────────────────────────────────────────────
#  GET /api/v1/screener
# ─────────────────────────────────────────────────────────────────────

@router.get("/api/v1/screener", response_model=list[ScreenerItem])
def get_screener(
    limit: int = Query(default=20, ge=1, le=50,
                       description="最多回傳幾檔，預設 20，最大 50"),
    market: str = Query(default="all",
                        description="all / us / tw"),
    include_live: bool = Query(
        default=False,
        description="true 時才即時呼叫外部 API；false 只讀 DB 快取（預設）"
    ),
    db: Session = Depends(get_db),
):
    """
    DB-first Screener。
    - 預設 include_live=false：純讀 DB，< 3 秒目標。
    - 美股無 DB 價格時自動嘗試 Finnhub quick-quote fallback。
    - 每檔獨立 try/except，不讓單一 ticker 拖垮整個 request。
    """
    # ── 1. 取 Watchlist symbols ──────────────────────────────────────
    watchlist_symbols = {
        w.symbol for w in db.execute(select(Watchlist)).scalars().all()
    }

    # ── 2. 查 Tickers，依 market 參數篩選 ───────────────────────────
    tickers_q = select(Ticker).where(Ticker.symbol.in_(watchlist_symbols))
    tickers = db.execute(tickers_q).scalars().all()

    if market == "us":
        tickers = [t for t in tickers if not t.symbol.endswith(".TW")]
    elif market == "tw":
        tickers = [t for t in tickers if t.symbol.endswith(".TW")]

    # apply limit
    tickers = tickers[:limit]

    if not tickers:
        return []

    items: list[ScreenerItem] = []

    for ticker in tickers:
        try:
            is_tw = ticker.symbol.endswith(".TW")
            currency = "TWD" if is_tw else "USD"

            # ── 3. 取價格：DB → Finnhub fallback（US only）──────────
            price: Optional[float] = None

            if is_tw:
                # Taiwan: 嘗試 TWSE live，再從 DB
                try:
                    tw_p = yf_svc.get_twse_price(ticker.symbol)
                    if tw_p and tw_p.get("close"):
                        price = float(tw_p["close"])
                except Exception:
                    pass
                if not price:
                    price = _db_price(db, ticker.id)
            else:
                # US: 先從 DB
                price = _db_price(db, ticker.id)
                # DB 無價格 → Finnhub quick-quote（快速 fallback，< 1s）
                if not price:
                    price = _finnhub_price(ticker.symbol)

            # ── 4a. include_live=True：即時計算 hype score ──────────
            if include_live:
                try:
                    rt = _realtime_score(ticker.symbol, db, ticker.id)
                except Exception as e:
                    print(f"[screener] realtime error {ticker.symbol}: {e}")
                    rt = None

                if rt:
                    # 若即時拿到價格且比 DB 更新，覆蓋
                    if not price and is_tw is False:
                        price = _finnhub_price(ticker.symbol)

                    ml_label = rt.get("ml_risk_label")
                    hs_val = rt.get("hype_score")
                    items.append(ScreenerItem(
                        symbol=ticker.symbol,
                        name=ticker.name,
                        hype_score=hs_val,
                        hype_label=hype_label(hs_val) if hs_val is not None else None,
                        price=price,
                        price_change_pct=rt.get("price_change_pct"),
                        volume_spike=rt.get("volume_spike"),
                        ml_risk_label=ml_label,
                        ml_risk_text=_ML_RISK_TEXT.get(ml_label) if ml_label is not None else None,
                        mention_count_24h=rt.get("mention_count_24h", 0),
                        currency=currency,
                        data_quality=rt.get("data_quality", "insufficient"),
                    ))
                    continue

            # ── 4b. include_live=False（或 realtime 失敗）：讀 DB ───
            hype = _db_hype(db, ticker.id)

            # data_quality
            has_price = price is not None
            has_hype  = hype is not None and hype.hype_score is not None
            if has_price and has_hype:
                dq = "ok"
            elif has_price or has_hype:
                dq = "partial"
            else:
                dq = "insufficient"

            ml_label = int(hype.ml_risk_label) if hype and hype.ml_risk_label is not None else None
            hs_val   = float(hype.hype_score) if hype and hype.hype_score is not None else None

            items.append(ScreenerItem(
                symbol=ticker.symbol,
                name=ticker.name,
                hype_score=hs_val,
                hype_label=hype_label(hs_val) if hs_val is not None else None,
                price=price,
                price_change_pct=round(float(hype.price_change_pct) * 100, 2) if hype and hype.price_change_pct else None,
                volume_spike=round(float(hype.volume_spike), 2) if hype and hype.volume_spike else None,
                ml_risk_label=ml_label,
                ml_risk_text=_ML_RISK_TEXT.get(ml_label) if ml_label is not None else None,
                mention_count_24h=int(hype.mention_count_24h) if hype and hype.mention_count_24h else 0,
                currency=currency,
                data_quality=dq,
            ))

        except Exception as exc:
            print(f"[screener] unhandled error for {ticker.symbol}: {exc}")
            items.append(ScreenerItem(
                symbol=ticker.symbol,
                name=getattr(ticker, "name", None),
                hype_score=None,
                hype_label=None,
                price=None,
                price_change_pct=None,
                volume_spike=None,
                ml_risk_label=None,
                ml_risk_text=None,
                mention_count_24h=0,
                currency="USD" if not ticker.symbol.endswith(".TW") else "TWD",
                data_quality="error",
            ))

    # Sort by hype_score desc, nulls last
    items.sort(key=lambda x: (x.hype_score is None, -(x.hype_score or 0)))
    return items


# ─────────────────────────────────────────────────────────────────────
#  GET /api/v1/trending
# ─────────────────────────────────────────────────────────────────────

@router.get("/api/v1/trending")
async def get_trending(limit: int = 10):
    try:
        tickers = await get_trending_tickers(limit=limit)
        return {"trending": tickers}
    except Exception as e:
        print(f"[screener] trending error: {e}")
        return {"trending": []}
