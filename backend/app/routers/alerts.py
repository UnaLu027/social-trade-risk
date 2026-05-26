from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, desc
from app.database import get_db
from app.models import Alert, Ticker, Watchlist, HypeScore
from app.schemas.alert import AlertResponse, WatchlistItem, WatchlistAddRequest
from app.services.hype_calculator import get_latest_hype, hype_label
from app.services import yfinance_service as yf_svc
from app.services.ticker_utils import normalize_symbol

router = APIRouter(prefix="/api/v1", tags=["alerts"])

SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


@router.get("/alerts", response_model=list[AlertResponse])
def list_alerts(
    severity: str | None = Query(None),
    is_read: bool | None = Query(None),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    q = select(Alert, Ticker.symbol).join(Ticker, Alert.ticker_id == Ticker.id)
    if severity:
        q = q.where(Alert.severity == severity)
    if is_read is not None:
        q = q.where(Alert.is_read == is_read)
    q = q.order_by(desc(Alert.ts)).limit(limit)

    rows = db.execute(q).all()
    results = []
    for alert, symbol in rows:
        meta = alert.metadata_ or {}
        results.append(AlertResponse(
            id=alert.id,
            ticker=symbol,
            severity=alert.severity,
            rule_name=alert.rule_name,
            message=alert.message or "",
            hype_score=float(alert.hype_score) if alert.hype_score else None,
            ts=alert.ts,
            is_read=alert.is_read,
            trigger_explanation=meta.get("explanation", ""),
        ))
    return sorted(results, key=lambda a: (SEVERITY_ORDER.get(a.severity, 4), -a.ts.timestamp()))


@router.post("/alerts/{alert_id}/read")
def mark_alert_read(alert_id: int, db: Session = Depends(get_db)):
    alert = db.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    db.commit()
    return {"status": "ok"}


@router.get("/watchlist", response_model=list[WatchlistItem])
def get_watchlist(db: Session = Depends(get_db)):
    wl_items = db.execute(select(Watchlist)).scalars().all()
    result = []
    for wl in wl_items:
        ticker = db.execute(select(Ticker).where(Ticker.symbol == wl.symbol)).scalar_one_or_none()
        hype = get_latest_hype(db, ticker.id) if ticker else None
        price_change = yf_svc.get_price_change_pct(db, ticker.id, hours=24) if ticker else 0.0
        hs_val = float(hype.hype_score) if hype else None
        result.append(WatchlistItem(
            symbol=wl.symbol,
            hype_score=hs_val,
            hype_label=hype_label(hs_val) if hs_val is not None else None,
            price_change_pct=round(price_change * 100, 2),
            added_at=wl.added_at,
        ))
    return result


@router.post("/watchlist", response_model=WatchlistItem)
def add_to_watchlist(body: WatchlistAddRequest, db: Session = Depends(get_db)):
    # normalize_symbol converts "2330" → "2330.TW" and uppercases US tickers
    symbol = normalize_symbol(body.symbol)
    existing = db.execute(select(Watchlist).where(Watchlist.symbol == symbol)).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"{symbol} already in watchlist")
    wl = Watchlist(symbol=symbol)
    db.add(wl)
    db.commit()
    db.refresh(wl)
    return WatchlistItem(symbol=wl.symbol, added_at=wl.added_at)


@router.delete("/watchlist/{symbol}")
def remove_from_watchlist(symbol: str, db: Session = Depends(get_db)):
    # normalize_symbol so "2330" matches the stored "2330.TW"
    normalized = normalize_symbol(symbol)
    wl = db.execute(select(Watchlist).where(Watchlist.symbol == normalized)).scalar_one_or_none()
    if not wl:
        raise HTTPException(status_code=404, detail=f"{normalized} not in watchlist")
    db.delete(wl)
    db.commit()
    return {"status": "removed"}
