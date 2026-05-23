import numpy as np
import pandas as pd

FEATURE_NAMES = [
    "mention_count_1h",
    "mention_count_24h",
    "mention_growth_ratio",
    "bullish_ratio",
    "avg_sentiment",
    "influencer_score",
    "price_change_pct_1h",
    "price_change_pct_24h",
    "volume_spike_ratio",
    "short_interest_ratio",
    "option_volume_spike",
    "hype_score_raw",
    "hour_of_day",
]

LABEL_MAP = {0: "low", 1: "medium", 2: "high"}
LABEL_TEXT_MAP = {0: "Low Risk", 1: "Medium Risk", 2: "High Risk"}


def _norm(value: float, low: float, high: float) -> float:
    if high == low:
        return 0.0
    return float(np.clip((value - low) / (high - low), 0.0, 1.0))


def compute_hype_score(
    mention_growth_ratio: float,
    bullish_ratio: float,
    volume_spike_ratio: float,
    avg_sentiment: float,
    price_change_pct_1h: float,
    option_volume_spike: float,
) -> float:
    score = (
        0.30 * _norm(mention_growth_ratio, 0, 5)
        + 0.20 * float(np.clip(bullish_ratio, 0, 1))
        + 0.20 * _norm(volume_spike_ratio, 0, 5)
        + 0.15 * _norm(avg_sentiment, -1, 1)
        + 0.10 * _norm(price_change_pct_1h, -0.5, 0.5)
        + 0.05 * _norm(option_volume_spike, 0, 5)
    )
    return float(np.clip(score * 100, 0, 100))


def build_feature_row(
    mention_count_1h: int,
    mention_count_24h: int,
    mention_growth_ratio: float,
    bullish_ratio: float,
    avg_sentiment: float,
    influencer_score: float,
    price_change_pct_1h: float,
    price_change_pct_24h: float,
    volume_spike_ratio: float,
    short_interest_ratio: float,
    option_volume_spike: float,
    hour_of_day: int = 12,
) -> dict:
    hype_score_raw = compute_hype_score(
        mention_growth_ratio,
        bullish_ratio,
        volume_spike_ratio,
        avg_sentiment,
        price_change_pct_1h,
        option_volume_spike,
    )
    return {
        "mention_count_1h": mention_count_1h,
        "mention_count_24h": mention_count_24h,
        "mention_growth_ratio": mention_growth_ratio,
        "bullish_ratio": bullish_ratio,
        "avg_sentiment": avg_sentiment,
        "influencer_score": influencer_score,
        "price_change_pct_1h": price_change_pct_1h,
        "price_change_pct_24h": price_change_pct_24h,
        "volume_spike_ratio": volume_spike_ratio,
        "short_interest_ratio": short_interest_ratio,
        "option_volume_spike": option_volume_spike,
        "hype_score_raw": hype_score_raw,
        "hour_of_day": hour_of_day,
    }


def identify_top_drivers(features: dict, hype_score: float) -> list[str]:
    drivers = []
    if features.get("mention_growth_ratio", 0) > 2.0:
        drivers.append("Mention Spike")
    if features.get("volume_spike_ratio", 0) > 2.0:
        drivers.append("Volume Surge")
    if features.get("bullish_ratio", 0) > 0.75:
        drivers.append("Bullish Surge")
    if features.get("short_interest_ratio", 0) > 0.3:
        drivers.append("Short Squeeze Risk")
    if features.get("option_volume_spike", 0) > 2.5:
        drivers.append("Options Activity")
    if features.get("avg_sentiment", 0) > 0.5:
        drivers.append("Positive Sentiment")
    if abs(features.get("price_change_pct_1h", 0)) > 0.15:
        drivers.append("Price Momentum")
    if not drivers:
        drivers.append("Normal Activity")
    return drivers[:4]
