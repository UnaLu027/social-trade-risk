from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models import Ticker, HypeScore, SocialMention
from app.services import yfinance_service as yf_svc
from app.services import reddit_service as reddit_svc
from app.ml.feature_engineering import compute_hype_score, build_feature_row, identify_top_drivers
from app.ml import inference


def compute_and_store_hype(db: Session, ticker: Ticker) -> HypeScore | None:
    now_utc = datetime.utcnow()

    # Mention counts
    count_1h = reddit_svc.count_mentions(db, ticker.id, hours=1)
    count_1h_prev = reddit_svc.count_mentions(db, ticker.id, hours=2) - count_1h
    mention_growth = count_1h / max(count_1h_prev, 1)

    count_24h = reddit_svc.count_mentions(db, ticker.id, hours=24)
    sentiment_stats = reddit_svc.get_sentiment_stats(db, ticker.id, hours=24)

    # Price metrics
    price_change_1h = yf_svc.get_price_change_pct(db, ticker.id, hours=1)
    price_change_24h = yf_svc.get_price_change_pct(db, ticker.id, hours=24)
    volume_spike = yf_svc.get_volume_spike(db, ticker.id)

    # Short interest estimation (static proxy, ~0.1 for normal stocks)
    short_interest = 0.1

    # Option activity proxy (volume spike carries this signal)
    option_spike = min(volume_spike * 0.4, 5.0)

    features = build_feature_row(
        mention_count_1h=count_1h,
        mention_count_24h=count_24h,
        mention_growth_ratio=mention_growth,
        bullish_ratio=sentiment_stats["bullish_ratio"],
        avg_sentiment=sentiment_stats["avg_sentiment"],
        influencer_score=sentiment_stats["influencer_score"],
        price_change_pct_1h=price_change_1h,
        price_change_pct_24h=price_change_24h,
        volume_spike_ratio=volume_spike,
        short_interest_ratio=short_interest,
        option_volume_spike=option_spike,
        hour_of_day=now_utc.hour,
    )

    hype_score = features["hype_score_raw"]
    risk_result = inference.predict_risk(features)
    top_drivers = identify_top_drivers(features, hype_score)

    hs = HypeScore(
        ticker_id=ticker.id,
        ts=now_utc,
        hype_score=round(hype_score, 2),
        mention_count_1h=count_1h,
        mention_count_24h=count_24h,
        bullish_ratio=round(sentiment_stats["bullish_ratio"], 3),
        avg_sentiment=round(sentiment_stats["avg_sentiment"], 4),
        price_change_pct=round(price_change_24h, 4),
        volume_spike=round(volume_spike, 4),
        ml_risk_label=risk_result["label"],
        ml_risk_prob=round(max(risk_result["probabilities"]), 4),
        top_drivers=top_drivers,
    )
    db.add(hs)
    db.commit()
    db.refresh(hs)
    return hs


def get_latest_hype(db: Session, ticker_id: int) -> HypeScore | None:
    return db.execute(
        select(HypeScore)
        .where(HypeScore.ticker_id == ticker_id)
        .order_by(HypeScore.ts.desc())
        .limit(1)
    ).scalar_one_or_none()


def hype_label(score: float) -> str:
    if score >= 75:
        return "critical"
    if score >= 55:
        return "high"
    if score >= 35:
        return "medium"
    return "low"
