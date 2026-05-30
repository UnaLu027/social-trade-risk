import re
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User, UserWatchlistItem
from app.schemas.user import PersonalWatchlistItem, AddToWatchlistRequest
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/v1/me", tags=["personal watchlist"])

MAX_WATCHLIST_SIZE = 20
_US_SYMBOL_RE = re.compile(r"^[A-Z][A-Z0-9]{0,9}$")


def _validate_us_symbol(symbol: str) -> str:
    s = symbol.strip().upper()
    if not _US_SYMBOL_RE.match(s):
        raise HTTPException(status_code=400, detail="Symbol must be 1–10 uppercase alphanumeric chars (US stocks only)")
    if ".TW" in s or s.endswith(".T"):
        raise HTTPException(status_code=400, detail="Taiwan stocks are not supported")
    return s


@router.get("/watchlist", response_model=list[PersonalWatchlistItem])
def get_personal_watchlist(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = (
        db.query(UserWatchlistItem)
        .filter(UserWatchlistItem.user_id == current_user.id, UserWatchlistItem.is_active == True)
        .order_by(UserWatchlistItem.created_at.asc())
        .all()
    )
    return items


@router.post("/watchlist", response_model=PersonalWatchlistItem, status_code=201)
def add_to_personal_watchlist(
    body: AddToWatchlistRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    symbol = _validate_us_symbol(body.symbol)

    # Count currently active items for this user
    active_count = (
        db.query(UserWatchlistItem)
        .filter(UserWatchlistItem.user_id == current_user.id, UserWatchlistItem.is_active == True)
        .count()
    )

    # Check whether this symbol was previously added (active or removed)
    existing = (
        db.query(UserWatchlistItem)
        .filter(UserWatchlistItem.user_id == current_user.id, UserWatchlistItem.symbol == symbol)
        .first()
    )

    if existing:
        if existing.is_active:
            raise HTTPException(status_code=409, detail=f"{symbol} is already in your watchlist")
        # Re-activate a previously removed item
        if active_count >= MAX_WATCHLIST_SIZE:
            raise HTTPException(status_code=400, detail=f"Watchlist full ({MAX_WATCHLIST_SIZE} symbols max)")
        existing.is_active = True
        existing.removed_at = None
        db.commit()
        db.refresh(existing)
        return existing

    # New item
    if active_count >= MAX_WATCHLIST_SIZE:
        raise HTTPException(status_code=400, detail=f"Watchlist full ({MAX_WATCHLIST_SIZE} symbols max)")

    item = UserWatchlistItem(user_id=current_user.id, symbol=symbol)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/watchlist/{symbol}", status_code=200)
def remove_from_personal_watchlist(
    symbol: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    symbol = symbol.strip().upper()
    item = (
        db.query(UserWatchlistItem)
        .filter(
            UserWatchlistItem.user_id == current_user.id,
            UserWatchlistItem.symbol == symbol,
            UserWatchlistItem.is_active == True,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail=f"{symbol} not found in your watchlist")

    item.is_active = False
    item.removed_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "removed", "symbol": symbol}
