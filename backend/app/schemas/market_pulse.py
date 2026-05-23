from datetime import datetime
from pydantic import BaseModel


class PricePoint(BaseModel):
    ts: datetime
    close: float
    volume: int


class PostCard(BaseModel):
    post_id: str
    body_snippet: str
    author: str
    score: int
    sentiment: float
    is_bullish: bool
    url: str
    ts: datetime


class MarketPulseResponse(BaseModel):
    ticker: str
    price: float
    price_change_pct: float
    volume: int
    volume_spike_ratio: float
    hype_score: float
    hype_label: str
    mention_count_1h: int
    mention_count_24h: int
    bullish_ratio: float
    avg_sentiment: float
    top_drivers: list[str]
    ml_risk_prob: list[float]
    top_posts: list[PostCard]
    price_history_24h: list[PricePoint]


class TickerSummary(BaseModel):
    symbol: str
    name: str | None
    hype_score: float
    hype_label: str
    price_change_pct: float
