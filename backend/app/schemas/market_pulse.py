from datetime import datetime
from typing import Optional
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


class NewsItem(BaseModel):
    title: str
    publisher: str
    link: str
    published_at: str
    sentiment_score: float


class MarketPulseResponse(BaseModel):
    ticker: str
    price: Optional[float] = None
    price_change_pct: Optional[float] = None
    volume: Optional[int] = None
    volume_spike_ratio: Optional[float] = None
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
    news_items: list[NewsItem] = []
    updated_at: Optional[datetime] = None   # timestamp of the most recent price data point


class TickerSummary(BaseModel):
    symbol: str
    name: str | None
    hype_score: float
    hype_label: str
    price_change_pct: float
