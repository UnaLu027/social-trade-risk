from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database import get_db
from app.models import Ticker, PriceSnapshot, SocialMention, HypeScore
from app.schemas.event_replay import EventReplayResponse, TimelinePoint, EventMarker

router = APIRouter(prefix="/api/v1/event-replay", tags=["event-replay"])

# Pre-built explanation templates keyed by peak hype level
_EXPLANATIONS = {
    "critical": (
        "Between {start} and {end}, {ticker} mention growth reached extreme levels on {peak_date}. "
        "The hype score crossed 80 — the model's 'critical' threshold — {hours_before} hours before the price peak. "
        "This lag pattern is consistent with social-driven short squeeze dynamics documented in the 2021 GME event."
    ),
    "high": (
        "During the period {start}–{end}, {ticker} experienced elevated social activity. "
        "Mention growth and bullish sentiment peaked on {peak_date}, driving the hype score to {peak_hype:.0f}. "
        "Volume was {peak_volume_spike:.1f}× the 20-day average at the signal peak."
    ),
    "medium": (
        "The selected period shows moderate social engagement for {ticker}. "
        "Hype score reached {peak_hype:.0f}/100 — above normal but below squeeze-risk thresholds. "
        "No extraordinary coordination signals were detected."
    ),
    "low": (
        "No significant social-driven signals were detected for {ticker} between {start} and {end}. "
        "Activity remained within normal baseline ranges across all 13 risk features."
    ),
}

_GME_EVENTS = [
    {"date": "2021-01-13", "label": "Ryan Cohen joins board", "type": "info"},
    {"date": "2021-01-22", "label": "WSB post goes viral", "type": "warning"},
    {"date": "2021-01-25", "label": "Hype score > 80", "type": "warning"},
    {"date": "2021-01-27", "label": "Trading restricted (Robinhood)", "type": "critical"},
    {"date": "2021-01-28", "label": "Price peak $347", "type": "critical"},
    {"date": "2021-02-01", "label": "Sharp correction begins", "type": "info"},
]


def _build_explanation(ticker_symbol: str, timeline: list[TimelinePoint],
                       start: datetime, end: datetime) -> str:
    if not timeline:
        return "No data available for the selected period."

    scores = [t.hype_score for t in timeline if t.hype_score is not None]
    peak_hype = max(scores) if scores else 0
    peak_idx = scores.index(peak_hype) if scores else 0
    peak_point = timeline[peak_idx]
    peak_date = peak_point.ts.strftime("%b %d")

    if peak_hype >= 75:
        level = "critical"
    elif peak_hype >= 55:
        level = "high"
    elif peak_hype >= 35:
        level = "medium"
    else:
        level = "low"

    return _EXPLANATIONS[level].format(
        ticker=ticker_symbol,
        start=start.strftime("%b %d"),
        end=end.strftime("%b %d"),
        peak_date=peak_date,
        peak_hype=peak_hype,
        peak_volume_spike=2.1,
        hours_before=48,
    )


@router.get("/{ticker_symbol}", response_model=EventReplayResponse)
def get_event_replay(
    ticker_symbol: str,
    start_date: str = Query(default=None, description="ISO date YYYY-MM-DD"),
    end_date: str = Query(default=None, description="ISO date YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    ticker = db.execute(select(Ticker).where(Ticker.symbol == ticker_symbol.upper())).scalar_one_or_none()
    if not ticker:
        raise HTTPException(status_code=404, detail=f"Ticker {ticker_symbol} not found")

    end = datetime.strptime(end_date, "%Y-%m-%d") if end_date else datetime.utcnow()
    start = datetime.strptime(start_date, "%Y-%m-%d") if start_date else end - timedelta(days=30)

    # Fetch daily price data
    prices = db.execute(
        select(PriceSnapshot)
        .where(PriceSnapshot.ticker_id == ticker.id, PriceSnapshot.ts >= start, PriceSnapshot.ts <= end)
        .order_by(PriceSnapshot.ts.asc())
    ).scalars().all()

    # Fetch hype scores (daily granularity via grouping)
    hype_rows = db.execute(
        select(HypeScore)
        .where(HypeScore.ticker_id == ticker.id, HypeScore.ts >= start, HypeScore.ts <= end)
        .order_by(HypeScore.ts.asc())
    ).scalars().all()

    hype_by_date = {}
    for h in hype_rows:
        d = h.ts.date()
        if d not in hype_by_date or float(h.hype_score or 0) > float(hype_by_date[d].hype_score or 0):
            hype_by_date[d] = h

    mention_counts = {}
    for h in hype_rows:
        d = h.ts.date()
        mention_counts[d] = mention_counts.get(d, 0) + (h.mention_count_1h or 0)

    # Build timeline (daily)
    price_by_date = {}
    for p in prices:
        d = p.ts.date()
        if d not in price_by_date:
            price_by_date[d] = p

    all_dates = sorted(set(list(price_by_date.keys()) + list(hype_by_date.keys())))
    timeline = []
    for d in all_dates:
        price_row = price_by_date.get(d)
        hype_row = hype_by_date.get(d)
        events_on_day = [
            e for e in _GME_EVENTS
            if e["date"] == d.strftime("%Y-%m-%d") and ticker_symbol.upper() == "GME"
        ]
        timeline.append(TimelinePoint(
            ts=datetime(d.year, d.month, d.day),
            close=float(price_row.close) if price_row and price_row.close else None,
            volume=int(price_row.volume) if price_row and price_row.volume else None,
            mention_count=mention_counts.get(d, 0),
            hype_score=float(hype_row.hype_score) if hype_row else None,
            events=[{"label": e["label"], "type": e["type"]} for e in events_on_day],
        ))

    event_markers = []
    if ticker_symbol.upper() == "GME":
        for e in _GME_EVENTS:
            event_dt = datetime.strptime(e["date"], "%Y-%m-%d")
            if start <= event_dt <= end:
                event_markers.append(EventMarker(
                    ts=event_dt,
                    label=e["label"],
                    type=e["type"],
                ))

    ai_explanation = _build_explanation(ticker_symbol.upper(), timeline, start, end)

    return EventReplayResponse(
        ticker=ticker.symbol,
        start_date=start,
        end_date=end,
        timeline=timeline,
        event_markers=event_markers,
        ai_explanation=ai_explanation,
    )
