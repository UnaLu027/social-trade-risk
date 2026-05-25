from datetime import datetime, timezone, timedelta
from typing import Optional
import yfinance as yf
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models import Ticker, PriceSnapshot


def _get_or_create_ticker(db: Session, symbol: str) -> Ticker:
    ticker = db.execute(select(Ticker).where(Ticker.symbol == symbol)).scalar_one_or_none()
    if not ticker:
        ticker = Ticker(symbol=symbol, name=symbol, is_active=True)
        db.add(ticker)
        db.commit()
        db.refresh(ticker)
    return ticker


def fetch_and_store_prices(db: Session, symbol: str, period: str = "1d", interval: str = "5m"):
    try:
        yf_ticker = yf.Ticker(symbol)
        hist = yf_ticker.history(period=period, interval=interval)
        if hist.empty:
            return 0

        ticker = _get_or_create_ticker(db, symbol)
        inserted = 0
        for ts, row in hist.iterrows():
            ts_utc = ts.to_pydatetime().astimezone(timezone.utc).replace(tzinfo=None)
            exists = db.execute(
                select(PriceSnapshot).where(
                    PriceSnapshot.ticker_id == ticker.id,
                    PriceSnapshot.ts == ts_utc,
                )
            ).scalar_one_or_none()
            if not exists:
                snap = PriceSnapshot(
                    ticker_id=ticker.id,
                    ts=ts_utc,
                    open=float(row["Open"]) if not pd.isna(row["Open"]) else None,
                    high=float(row["High"]) if not pd.isna(row["High"]) else None,
                    low=float(row["Low"]) if not pd.isna(row["Low"]) else None,
                    close=float(row["Close"]) if not pd.isna(row["Close"]) else None,
                    volume=int(row["Volume"]) if not pd.isna(row["Volume"]) else None,
                )
                db.add(snap)
                inserted += 1
        db.commit()
        return inserted
    except Exception as e:
        db.rollback()
        print(f"[yfinance] Error fetching {symbol}: {e}")
        return 0


def get_latest_price(db: Session, ticker_id: int) -> Optional[dict]:
    row = db.execute(
        select(PriceSnapshot)
        .where(PriceSnapshot.ticker_id == ticker_id)
        .order_by(PriceSnapshot.ts.desc())
        .limit(1)
    ).scalar_one_or_none()
    if not row:
        return None
    return {
        "close": float(row.close or 0),
        "volume": int(row.volume or 0),
        "ts": row.ts,
    }


def get_price_history(db: Session, ticker_id: int, hours: int = 24) -> list[dict]:
    since = datetime.utcnow() - timedelta(hours=hours)
    rows = db.execute(
        select(PriceSnapshot)
        .where(PriceSnapshot.ticker_id == ticker_id, PriceSnapshot.ts >= since)
        .order_by(PriceSnapshot.ts.asc())
    ).scalars().all()
    return [
        {"ts": r.ts, "close": float(r.close or 0), "volume": int(r.volume or 0)}
        for r in rows
    ]


def get_volume_spike(db: Session, ticker_id: int) -> float:
    rows = db.execute(
        select(PriceSnapshot)
        .where(PriceSnapshot.ticker_id == ticker_id)
        .order_by(PriceSnapshot.ts.desc())
        .limit(200)
    ).scalars().all()
    if len(rows) < 10:
        return 1.0
    recent_vol = float(rows[0].volume or 1)
    avg_vol = sum(float(r.volume or 1) for r in rows[1:]) / (len(rows) - 1)
    return recent_vol / max(avg_vol, 1)


def get_price_change_pct(db: Session, ticker_id: int, hours: int = 1) -> float:
    since = datetime.utcnow() - timedelta(hours=hours + 0.5)
    rows = db.execute(
        select(PriceSnapshot)
        .where(PriceSnapshot.ticker_id == ticker_id, PriceSnapshot.ts >= since)
        .order_by(PriceSnapshot.ts.asc())
    ).scalars().all()
    if len(rows) < 2:
        return 0.0
    first = float(rows[0].close or 1)
    last = float(rows[-1].close or 1)
    return (last - first) / max(first, 0.01)


def get_live_price(symbol: str) -> Optional[dict]:
    """
    Direct yfinance call that bypasses the DB.
    Used as fallback when PriceSnapshot table has no recent rows.
    Tries fast_info first; falls back to a 2-day history() call.
    """
    try:
        ticker_obj = yf.Ticker(symbol)

        # Attempt 1: fast_info (single lightweight request)
        try:
            fast = ticker_obj.fast_info
            price = getattr(fast, "last_price", None)
            if not price or float(price) <= 0:
                price = getattr(fast, "previous_close", None)
            volume = int(getattr(fast, "three_month_average_volume", 0) or 0)
            if price and float(price) > 0:
                return {
                    "close": float(price),
                    "volume": volume,
                    "ts": datetime.utcnow(),
                }
        except Exception:
            pass

        # Attempt 2: recent 2-day history
        hist = ticker_obj.history(period="2d", interval="1d", auto_adjust=True)
        if not hist.empty:
            last = hist.iloc[-1]
            if not pd.isna(last["Close"]) and float(last["Close"]) > 0:
                return {
                    "close": float(last["Close"]),
                    "volume": int(last["Volume"]) if not pd.isna(last["Volume"]) else 0,
                    "ts": datetime.utcnow(),
                }
    except Exception as e:
        print(f"[yfinance] get_live_price failed for {symbol}: {e}")
    return None


def get_live_history(symbol: str, days: int = 5) -> list[dict]:
    """
    Direct yfinance history call that bypasses the DB.
    Used as fallback when price_history returns an empty list.
    """
    try:
        ticker_obj = yf.Ticker(symbol)
        hist = ticker_obj.history(period=f"{days}d", interval="1h", auto_adjust=True)
        if hist.empty:
            hist = ticker_obj.history(period=f"{days}d", interval="1d", auto_adjust=True)
        if hist.empty:
            return []
        result = []
        for ts, row in hist.iterrows():
            if pd.isna(row["Close"]):
                continue
            ts_dt = ts.to_pydatetime()
            if ts_dt.tzinfo is not None:
                ts_dt = ts_dt.astimezone(timezone.utc).replace(tzinfo=None)
            result.append({
                "ts": ts_dt,
                "close": float(row["Close"]),
                "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
            })
        return result
    except Exception as e:
        print(f"[yfinance] get_live_history failed for {symbol}: {e}")
    return []


def fetch_news_with_sentiment(symbol: str, limit: int = 5) -> list[dict]:
    """
    Fetch recent news headlines for a symbol via yfinance and score each
    headline with VADER sentiment.  Returns [] on any failure.
    """
    try:
        from app.services.sentiment_service import score_text
        yf_ticker = yf.Ticker(symbol)
        news = yf_ticker.news or []
        results = []
        for article in news[:limit]:
            title = article.get("title", "")
            publisher = article.get("publisher", "")
            link = article.get("link", "")
            pub_time = article.get("providerPublishTime", 0)
            try:
                published_at = datetime.fromtimestamp(pub_time, tz=timezone.utc).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                )
            except Exception:
                published_at = ""
            sentiment_score = score_text(title)
            results.append(
                {
                    "title": title,
                    "publisher": publisher,
                    "link": link,
                    "published_at": published_at,
                    "sentiment_score": round(sentiment_score, 4),
                }
            )
        return results
    except Exception as e:
        print(f"[yfinance] fetch_news_with_sentiment failed for {symbol}: {e}")
        return []
