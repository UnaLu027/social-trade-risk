from datetime import datetime
from pydantic import BaseModel


class AlertResponse(BaseModel):
    id: int
    ticker: str
    severity: str
    rule_name: str
    message: str
    hype_score: float | None
    ts: datetime
    is_read: bool
    trigger_explanation: str


class WatchlistItem(BaseModel):
    symbol: str
    hype_score: float | None = None
    hype_label: str | None = None
    price_change_pct: float | None = None
    added_at: datetime


class WatchlistAddRequest(BaseModel):
    symbol: str
