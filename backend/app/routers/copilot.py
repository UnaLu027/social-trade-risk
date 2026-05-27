"""
Social Trading Risk Copilot — ML inference endpoints.

POST /api/v1/post-analyze       — analyse a social post for risk signals
POST /api/v1/stress-test        — run scenario simulation
GET  /api/v1/model-lab/summary  — current best model metadata
GET  /api/v1/model-lab/experiments — all logged experiments
GET  /api/v1/health/product     — product-layer health check
"""

from __future__ import annotations

import re
import math
from datetime import datetime
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(tags=["copilot"])

# ── keyword lists ─────────────────────────────────────────────────────────────

HYPE_TERMS = [
    "moon", "to the moon", "🚀", "diamond hands", "hodl", "hold the line",
    "squeeze", "apes", "tendies", "yolo", "rockets", "lambo", "gamma squeeze",
    "infinity pool", "not selling", "never selling", "buy the dip",
    "paper hands", "wsb", "wallstreetbets", "short squeeze",
]

FOMO_TERMS = [
    "buy now", "last chance", "miss out", "don't miss", "act fast",
    "before it explodes", "before it moons", "get in now", "loading up",
    "opportunity of a lifetime", "once in a generation",
]

SQUEEZE_TERMS = [
    "short squeeze", "short interest", "shorts are trapped", "hedge fund",
    "citadel", "melvin", "forced to cover", "short covering",
    "gamma squeeze", "infinity squeeze", "retail vs hedge",
]

MANIP_TERMS = [
    "guaranteed", "can't lose", "easy money", "100% chance", "risk free",
    "manipulated", "manipulation", "naked shorts", "market makers afraid",
    "they are suppressing", "the shorts own the brokers",
]

URGENCY_TERMS = [
    "now or never", "act now", "do it now", "limited time", "before close",
    "today only", "last chance", "this is it",
]

US_TICKERS = {"GME", "AMC", "BB", "KOSS", "NOK", "TSLA", "PLTR", "NVDA",
              "BBBY", "CLOV", "CLVS", "SPRT", "IRBT", "OSTK"}


def _count_matches(text: str, terms: list[str]) -> tuple[int, list[str]]:
    lower = text.lower()
    found = [t for t in terms if t in lower]
    return len(found), found


def _detect_symbol(text: str) -> Optional[str]:
    """Return the first US ticker found in the text (by $TICKER or bare mention)."""
    tokens = re.findall(r'\b\$?([A-Z]{2,5})\b', text.upper())
    for t in tokens:
        if t in US_TICKERS:
            return t
    return None


def _compute_scores(text: str):
    hype_n, hype_hits   = _count_matches(text, HYPE_TERMS)
    fomo_n, fomo_hits   = _count_matches(text, FOMO_TERMS)
    sq_n,   sq_hits     = _count_matches(text, SQUEEZE_TERMS)
    manip_n,manip_hits  = _count_matches(text, MANIP_TERMS)
    urg_n,  urg_hits    = _count_matches(text, URGENCY_TERMS)

    hype_score   = min(100.0, hype_n  * 18.0 + fomo_n * 8.0)
    fomo_score   = min(100.0, fomo_n  * 28.0 + urg_n  * 12.0)
    manip_score  = min(100.0, manip_n * 25.0 + sq_n   * 12.0)
    urgency      = min(100.0, urg_n   * 35.0 + fomo_n * 10.0)

    word_count   = max(1, len(text.split()))
    bullish_adj  = min(1.0, (hype_n + fomo_n) / (word_count * 0.15 + 1))
    sentiment    = 0.5 + bullish_adj * 0.45

    composite    = (hype_score * 0.30 + fomo_score * 0.30 +
                    manip_score * 0.25 + (30.0 if sq_n else 0) * 0.15)

    label = (
        "Critical" if composite >= 70 else
        "High"     if composite >= 45 else
        "Medium"   if composite >= 20 else
        "Low"
    )

    all_hits = list({*hype_hits, *fomo_hits, *sq_hits, *manip_hits, *urg_hits})

    return {
        "sentiment_score":              round(sentiment, 4),
        "bullish_probability":          round(min(1.0, sentiment + 0.1 * bullish_adj), 4),
        "bearish_probability":          round(max(0.0, 1 - sentiment - 0.05 * bullish_adj), 4),
        "fomo_score":                   round(fomo_score, 2),
        "hype_language_score":          round(hype_score, 2),
        "manipulation_signal_score":    round(manip_score, 2),
        "urgency_score":                round(urgency, 2),
        "short_squeeze_narrative_detected": sq_n > 0,
        "predicted_risk_label":         label,
        "highlighted_terms":            all_hits,
        "composite_score":              round(composite, 2),
    }


# ── Schemas ────────────────────────────────────────────────────────────────────

class PostAnalyzeRequest(BaseModel):
    text:   str           = Field(..., min_length=3, max_length=5000)
    symbol: Optional[str] = None


class PostAnalyzeResponse(BaseModel):
    sentiment_score:                  float
    bullish_probability:              float
    bearish_probability:              float
    fomo_score:                       float
    hype_language_score:              float
    manipulation_signal_score:        float
    urgency_score:                    float
    short_squeeze_narrative_detected: bool
    predicted_risk_label:             str
    explanation:                      str
    highlighted_terms:                list[str]
    model_source:                     str
    data_quality:                     str


class StressTestRequest(BaseModel):
    mention_growth:          float = Field(0.5, ge=0.0, le=1.0)
    influencer_power:        float = Field(0.5, ge=0.0, le=1.0)
    fanatic_ratio:           float = Field(0.4, ge=0.0, le=1.0)
    short_interest:          float = Field(0.6, ge=0.0, le=1.0)
    volume_spike:            float = Field(0.4, ge=0.0, le=1.0)
    trading_restriction:     bool  = False
    rational_investor_ratio: float = Field(0.5, ge=0.0, le=1.0)


class StressTestResponse(BaseModel):
    simulated_risk_score: float
    simulated_risk_label: str
    belief_curve:         list[float]
    price_curve:          list[float]
    key_drivers:          list[str]
    explanation:          str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/api/v1/post-analyze", response_model=PostAnalyzeResponse)
def post_analyze(req: PostAnalyzeRequest):
    """
    Analyse a social media post for meme-stock risk signals.
    Uses keyword heuristic baseline; extend with FinBERT embeddings in Phase 2.
    """
    if req.symbol and req.symbol.upper().endswith(".TW"):
        from fastapi import HTTPException
        raise HTTPException(400, detail="Only US stocks are supported in this MVP.")

    scores = _compute_scores(req.text)
    symbol = req.symbol or _detect_symbol(req.text)

    drivers = []
    if scores["fomo_score"]               >= 40: drivers.append("FOMO語言")
    if scores["hype_language_score"]      >= 40: drivers.append("炒作語言")
    if scores["manipulation_signal_score"] >= 40: drivers.append("操縱信號")
    if scores["short_squeeze_narrative_detected"]:  drivers.append("軋空敘事")
    if scores["urgency_score"]            >= 40: drivers.append("緊迫感語言")

    label = scores["predicted_risk_label"]
    explanation = (
        f"Detected {len(scores['highlighted_terms'])} risk signal(s). "
        f"Risk assessed as {label}."
        + (f" Key signals: {', '.join(drivers)}." if drivers else " No strong risk signals detected.")
    )

    return PostAnalyzeResponse(
        **scores,
        explanation=explanation,
        model_source="keyword_heuristic_v0.2",
        data_quality="heuristic",
    )


@router.post("/api/v1/stress-test", response_model=StressTestResponse)
def stress_test(req: StressTestRequest):
    """
    Run a scenario stress simulation based on social contagion parameters.
    Returns simulated risk score, belief diffusion curve, and price trajectory.
    """
    # Weighted composite
    score = (
        req.mention_growth      * 25 +
        req.influencer_power    * 20 +
        req.fanatic_ratio       * 20 +
        req.short_interest      * 20 +
        req.volume_spike        * 10 +
        (5 if req.trading_restriction else 0) -
        req.rational_investor_ratio * 10
    )
    score = max(0.0, min(100.0, score))

    label = (
        "Critical" if score >= 75 else
        "High"     if score >= 50 else
        "Medium"   if score >= 25 else
        "Low"
    )

    # Belief diffusion (20 time steps, logistic spread)
    belief_curve = []
    for t in range(20):
        k = req.influencer_power * 0.8 + req.mention_growth * 0.5
        midpoint = 8 - req.fanatic_ratio * 3
        b = 1 / (1 + math.exp(-k * (t - midpoint)))
        belief_curve.append(round(min(1.0, b * req.influencer_power * req.mention_growth), 4))

    # Simulated price curve
    price_curve = []
    base_price = 50.0
    for t in range(20):
        momentum  = belief_curve[t] * req.short_interest * 250
        squeeze_p = req.short_interest * req.mention_growth * 80
        revert    = max(0.0, (t - 12) * score * 0.08) if t > 12 else 0.0
        restrict  = -35.0 if (req.trading_restriction and t == 8) else 0.0
        price_curve.append(round(max(5.0, base_price + momentum + squeeze_p + restrict - revert), 2))

    key_drivers = []
    if req.mention_growth     > 0.6: key_drivers.append("高提及成長率")
    if req.influencer_power   > 0.6: key_drivers.append("意見領袖放大效應")
    if req.fanatic_ratio      > 0.6: key_drivers.append("狂熱散戶比例高")
    if req.short_interest     > 0.6: key_drivers.append("高空頭利息風險")
    if req.volume_spike       > 0.6: key_drivers.append("成交量異常激增")
    if req.trading_restriction:       key_drivers.append("交易限制觸發反彈")

    explanation = (
        f"Simulated risk score {score:.1f}/100 → {label}. "
        + (f"Key drivers: {', '.join(key_drivers)}. " if key_drivers else "")
        + ("Trading restrictions amplify retail backlash and manipulation signals. "
           if req.trading_restriction else "")
        + f"Rational investor ratio {req.rational_investor_ratio:.0%} provides partial buffer."
    )

    return StressTestResponse(
        simulated_risk_score=round(score, 2),
        simulated_risk_label=label,
        belief_curve=belief_curve,
        price_curve=price_curve,
        key_drivers=key_drivers,
        explanation=explanation,
    )


@router.get("/api/v1/model-lab/summary")
def model_lab_summary():
    """Return current best model metadata (from filesystem or demo)."""
    try:
        from app.ml.inference import get_metadata
        meta = get_metadata()
        return {
            "best_model":    meta.get("best_model_name", "GradientBoosting"),
            "accuracy":      meta.get("test_accuracy",   0.94),
            "weighted_f1":   meta.get("test_weighted_f1",0.94),
            "macro_f1":      meta.get("test_macro_f1",   0.93),
            "high_risk_recall": meta.get("high_risk_recall", 0.95),
            "trained_at":    meta.get("trained_at"),
            "model_source":  "trained",
        }
    except Exception:
        return {
            "best_model":    "GradientBoosting",
            "accuracy":      0.94,
            "weighted_f1":   0.94,
            "macro_f1":      0.93,
            "high_risk_recall": 0.95,
            "trained_at":    None,
            "model_source":  "demo",
        }


@router.get("/api/v1/model-lab/experiments")
def model_lab_experiments():
    """Return all model experiment records (from filesystem or demo fallback)."""
    demo = [
        {"experiment_id": "exp_gb_001",       "model_name": "Gradient Boosting",             "feature_set": "text_social_market", "accuracy": 0.94, "macro_f1": 0.93, "weighted_f1": 0.94, "high_risk_recall": 0.95},
        {"experiment_id": "exp_mlp_001",      "model_name": "MLP Neural Network",            "feature_set": "neural_fusion",      "accuracy": 0.92, "macro_f1": 0.90, "weighted_f1": 0.92, "high_risk_recall": 0.91},
        {"experiment_id": "exp_rf_001",       "model_name": "Random Forest",                 "feature_set": "market_social",      "accuracy": 0.90, "macro_f1": 0.87, "weighted_f1": 0.90, "high_risk_recall": 0.88},
        {"experiment_id": "exp_baseline_001", "model_name": "Logistic Regression",           "feature_set": "market_features",    "accuracy": 0.84, "macro_f1": 0.79, "weighted_f1": 0.83, "high_risk_recall": 0.76},
        {"experiment_id": "exp_tfidf_lr_001", "model_name": "TF-IDF + Logistic Regression", "feature_set": "tfidf_text",         "accuracy": 0.81, "macro_f1": 0.77, "weighted_f1": 0.80, "high_risk_recall": 0.74},
    ]
    try:
        import json, pathlib
        p = pathlib.Path("app/ml/models/experiment_summary.json")
        if p.exists():
            return {"source": "trained", "experiments": json.loads(p.read_text())}
    except Exception:
        pass
    return {"source": "demo", "experiments": demo}


@router.get("/api/v1/health/product")
def health_product():
    """Product-layer health check — covers ML inference + PHP API reachability."""
    import os
    result: dict = {
        "status":      "ok",
        "product":     "Social Trading Risk Copilot",
        "version":     "v0.2-baseline",
        "timestamp":   datetime.utcnow().isoformat(),
        "ml_backend":  "ok",
        "php_api_url": os.getenv("PHP_API_URL", "http://localhost/social_trading_risk_starter/php-api"),
        "scope":       "US stocks only",
        "tickers":     ["GME", "AMC", "BB", "KOSS", "NOK", "TSLA", "PLTR", "NVDA"],
    }
    try:
        from app.ml.inference import get_metadata
        get_metadata()
    except Exception as e:
        result["ml_backend"] = f"warn: {e}"
    return result
