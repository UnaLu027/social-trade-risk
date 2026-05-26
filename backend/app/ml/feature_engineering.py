import numpy as np
import pandas as pd

# ── Original 13 features (backward-compatible, used by hype_rf_model.pkl) ──────
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

# ── Extended 16 features (used by experiment_train.py / best_model.pkl) ────────
# Three derived features added:
#   mention_accel     – 24h mention count vs extrapolated 1h rate; >1 = accelerating
#   sentiment_volume  – sentiment × volume spike composite signal
#   risk_composite    – mention_growth × volume_spike × (1 + short_interest)
EXTENDED_FEATURE_NAMES = FEATURE_NAMES + [
    "mention_accel",
    "sentiment_volume",
    "risk_composite",
]

# ── Text-extended 21 features (Phase 3) ─────────────────────────────────────
# Five text signal features added (see text_features.py for extraction logic).
# In production  → computed from real post body_snippet via VADER + heuristics.
# In training    → simulated from numeric signals (see simulate_from_signals).
# Design is compatible with future Transformer embedding replacement.
from app.ml.text_features import TEXT_FEATURE_NAMES   # noqa: E402
TEXT_EXTENDED_FEATURE_NAMES = EXTENDED_FEATURE_NAMES + TEXT_FEATURE_NAMES

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


def build_extended_feature_row(
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
    """Like build_feature_row but appends 3 derived features (for experiment_train.py)."""
    base = build_feature_row(
        mention_count_1h, mention_count_24h, mention_growth_ratio,
        bullish_ratio, avg_sentiment, influencer_score,
        price_change_pct_1h, price_change_pct_24h,
        volume_spike_ratio, short_interest_ratio, option_volume_spike,
        hour_of_day,
    )
    # mention_accel: >1 means mentions are accelerating beyond the hourly run-rate
    mention_accel = mention_count_24h / max(mention_count_1h * 24, 1)
    # sentiment_volume: bullish sentiment amplified by volume spike
    sentiment_volume = float(np.clip(bullish_ratio, 0, 1)) * float(np.clip(volume_spike_ratio / 5.0, 0, 1))
    # risk_composite: combined squeeze-pressure signal
    risk_composite = mention_growth_ratio * volume_spike_ratio * (1.0 + short_interest_ratio)
    return {
        **base,
        "mention_accel": round(float(np.clip(mention_accel, 0, 10)), 4),
        "sentiment_volume": round(float(np.clip(sentiment_volume, 0, 1)), 4),
        "risk_composite": round(float(np.clip(risk_composite, 0, 50)), 4),
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
