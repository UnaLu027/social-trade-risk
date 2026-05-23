from datetime import datetime
from pydantic import BaseModel


class TimelinePoint(BaseModel):
    ts: datetime
    close: float | None
    volume: int | None
    mention_count: int
    hype_score: float | None
    events: list[dict]


class EventMarker(BaseModel):
    ts: datetime
    label: str
    type: str
    note: str | None = None


class EventReplayResponse(BaseModel):
    ticker: str
    start_date: datetime
    end_date: datetime
    timeline: list[TimelinePoint]
    event_markers: list[EventMarker]
    ai_explanation: str
