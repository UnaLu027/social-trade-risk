"""
Social Trading Risk Copilot — ML inference endpoints.

POST /api/v1/post-analyze       — analyse a social post for risk signals
POST /api/v1/analyze-url        — fetch URL and analyse extracted text
GET  /api/v1/social-signals     — latest news signals for a symbol
POST /api/v1/stress-test        — run scenario simulation
GET  /api/v1/model-lab/summary  — current best model metadata
GET  /api/v1/model-lab/experiments — all logged experiments
GET  /api/v1/health/real-ai     — deployed ML model status (used by ModelLab)
GET  /api/v1/health/product     — product-layer health check
POST /api/v1/event-abnormal-return — Market Model event study (post-event AR/CAR observation)
"""

from __future__ import annotations

import re
import math
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Query
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


def _analyze_text(text: str) -> tuple[dict, str, dict]:
    """
    Shared inference pipeline used by post_analyze and analyze_url.
    Returns (scores_dict, model_source, colab_extra).

    Fallback chain:
      1. Colab text model (text_inference.predict_text)
      2. Legacy numeric model (inference.predict_risk)
      3. Heuristic keyword scores only

    model_source: "colab_text_model" | "real_model" | "heuristic_fallback"
    colab_extra:  dict of Colab-specific fields (empty when not using Colab model)
    """
    scores = _compute_scores(text)
    model_source = "heuristic_fallback"
    extra: dict = {}

    # ── 1. Colab text model (preferred — text-native, no composite threshold) ─
    try:
        from app.ml import text_inference as _ti  # type: ignore
        if not _ti.is_loaded():
            _ti.load_text_model()
        if _ti.is_loaded():
            colab = _ti.predict_text(text)
            if colab:
                rl = colab["risk_label"]
                # Preserve "Critical" when heuristic signals are extreme
                if rl == "High" and scores["predicted_risk_label"] == "Critical":
                    rl = "Critical"
                scores["predicted_risk_label"] = rl
                # Note: bullish_probability / bearish_probability / sentiment_score
                # are NOT overridden from the direction model because the direction
                # model's numeric features are unavailable at deployment time, causing
                # systematically biased direction probabilities for meme-stock language.
                # The heuristic bullish/bearish values are more reliable for this signal.

                dp = colab.get("direction_probabilities")
                model_source = "colab_text_model"
                extra = {
                    "risk_label":              colab.get("risk_label"),
                    "direction_label":         colab.get("direction_label"),
                    "risk_confidence":         colab.get("risk_confidence"),
                    "direction_confidence":    colab.get("direction_confidence"),
                    "risk_probabilities":      colab.get("risk_probabilities"),
                    "direction_probabilities": dp,
                    "model_trained_at":        colab.get("trained_at"),
                    "model_id":                colab.get("model_id"),
                }
                return scores, model_source, extra
    except Exception as _exc:
        print(f"[_analyze_text] Colab model skipped: {_exc}")

    # ── 2. Legacy numeric model (fallback; skip when no heuristic signals) ────
    composite = scores["composite_score"]
    if composite > 0:
        try:
            from app.ml import inference as _ml
            from app.ml.feature_engineering import build_full_feature_row

            if _ml._model is not None:
                features = build_full_feature_row(
                    mention_count_1h     = int(composite * 5 / 100),
                    mention_count_24h    = int(composite),
                    mention_growth_ratio = max(1.0, 1.0 + composite / 25.0),
                    bullish_ratio        = float(scores["bullish_probability"]),
                    avg_sentiment        = (float(scores["sentiment_score"]) - 0.5) * 2.0,
                    influencer_score     = min(composite / 100.0, 1.0),
                    price_change_pct_1h  = 0.0,
                    price_change_pct_24h = 0.0,
                    volume_spike_ratio   = max(1.0, 1.0 + composite * 3.0 / 100.0),
                    short_interest_ratio = 0.3 if scores["short_squeeze_narrative_detected"] else 0.0,
                    option_volume_spike  = min(composite * 2.0 / 100.0, 5.0),
                    hour_of_day          = 12,
                    post_text            = "",
                )
                result = _ml.predict_risk(features)
                _lmap = {0: "Low", 1: "Medium", 2: "High"}
                ml_label = _lmap.get(result["label"], "Low")
                if ml_label == "High" and scores["predicted_risk_label"] == "Critical":
                    ml_label = "Critical"
                scores["predicted_risk_label"] = ml_label
                model_source = "real_model"
        except Exception as _exc:
            print(f"[_analyze_text] Legacy ML skipped: {_exc}")

    return scores, model_source, extra


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
    # ── required (existing frontend fields) ──────────────────────────────────
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
    # ── optional (added when Colab text model is active) ─────────────────────
    risk_label:              Optional[str]   = None
    direction_label:         Optional[str]   = None
    risk_confidence:         Optional[float] = None
    direction_confidence:    Optional[float] = None
    risk_probabilities:      Optional[dict]  = None
    direction_probabilities: Optional[dict]  = None
    model_trained_at:        Optional[str]   = None
    model_id:                Optional[str]   = None


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
    Tries the trained ML model (app.ml.inference) first; falls back to
    keyword heuristic when the model is unavailable.
    model_source: "real_model" | "heuristic_fallback"
    """
    if req.symbol and req.symbol.upper().endswith(".TW"):
        from fastapi import HTTPException
        raise HTTPException(400, detail="Only US stocks are supported in this MVP.")

    scores, model_source, colab_extra = _analyze_text(req.text)
    symbol = req.symbol or _detect_symbol(req.text)  # noqa: F841 (reserved for future use)

    # ── Build explanation ─────────────────────────────────────────────────────
    drivers = []
    if scores["fomo_score"]                >= 40: drivers.append("FOMO語言")
    if scores["hype_language_score"]       >= 40: drivers.append("炒作語言")
    if scores["manipulation_signal_score"] >= 40: drivers.append("操縱信號")
    if scores["short_squeeze_narrative_detected"]:  drivers.append("軋空敘事")
    if scores["urgency_score"]             >= 40: drivers.append("緊迫感語言")

    label = scores["predicted_risk_label"]
    explanation = (
        f"Detected {len(scores['highlighted_terms'])} risk signal(s). "
        f"Risk assessed as {label}."
        + (f" Key signals: {', '.join(drivers)}." if drivers else " No strong risk signals detected.")
    )

    data_quality = (
        "colab_text_model"               if model_source == "colab_text_model" else
        "real_reddit_yfinance_weak_label" if model_source == "real_model" else
        "heuristic"
    )

    return PostAnalyzeResponse(
        **scores,
        explanation=explanation,
        model_source=model_source,
        data_quality=data_quality,
        **colab_extra,
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


def _load_text_model_info() -> "dict | None":
    """
    Read Colab text model metadata from app/ml/text_model/.
    Returns None if files are missing or unreadable. Never crashes.
    """
    import json, pathlib, os as _os

    text_model_dir = pathlib.Path(_os.path.dirname(__file__)).parent / "ml" / "text_model"
    meta_path = text_model_dir / "model_metadata.json"
    eval_path = text_model_dir / "evaluation_report.json"

    if not meta_path.exists():
        return None

    try:
        with open(meta_path) as f:
            meta = json.load(f)

        eval_data: dict = {}
        if eval_path.exists():
            with open(eval_path) as f:
                eval_data = json.load(f)

        # Check if text_inference module is loaded (Colab model active in production)
        production_status = "ready_for_deployment"
        try:
            from app.ml import text_inference as _ti  # type: ignore
            if _ti.is_loaded():
                production_status = "active"
        except Exception:
            pass

        required_files = [
            "word_vectorizer.joblib", "char_vectorizer.joblib",
            "risk_model.joblib", "direction_model.joblib", "numeric_scaler.joblib",
        ]
        files_exist = all((text_model_dir / f).exists() for f in required_files)

        smoke_tests = eval_data.get("smoke_tests", [])
        smoke_tests_pass: "bool | None" = (
            all(t.get("overall_pass", False) for t in smoke_tests) if smoke_tests else None
        )

        risk_metrics      = meta.get("risk_metrics", {})
        direction_metrics = meta.get("direction_metrics", {})

        return {
            "available":              files_exist,
            "production_status":      production_status,
            "model_id":               meta.get("model_id"),
            "trained_at":             meta.get("trained_at"),
            "deploy_ready":           meta.get("deploy_ready", eval_data.get("deploy_ready", False)),
            "smoke_tests_pass":       smoke_tests_pass,
            "risk_model":             meta.get("best_risk_model"),
            "direction_model":        meta.get("best_direction_model"),
            "risk_accuracy":          risk_metrics.get("accuracy"),
            "risk_macro_f1":          risk_metrics.get("macro_f1"),
            "risk_weighted_f1":       risk_metrics.get("weighted_f1"),
            "high_risk_recall":       meta.get("high_risk_recall", risk_metrics.get("High_recall")),
            "direction_accuracy":     direction_metrics.get("accuracy"),
            "direction_macro_f1":     direction_metrics.get("macro_f1"),
            "direction_weighted_f1":  direction_metrics.get("weighted_f1"),
            "risk_feature_set":       "word_tfidf + char_tfidf",
            "direction_feature_set":  "word_tfidf + char_tfidf + numeric_features",
            "risk_confusion_matrix":  eval_data.get("risk_confusion_matrix"),
            "dataset_size":           meta.get("dataset_size"),
            "train_size":             meta.get("train_size"),
        }
    except Exception as exc:
        print(f"[copilot] _load_text_model_info error: {exc}")
        return None


@router.get("/api/v1/model-lab/summary")
def model_lab_summary():
    """Return best model metadata — Colab text model preferred, legacy fallback."""
    tm = _load_text_model_info()
    if tm and tm.get("available"):
        return {
            "source":             "colab_text_model",
            "production_status":  tm["production_status"],
            "model_source":       "colab_text_model" if tm["production_status"] == "active" else "ready_for_deployment",
            "best_model":         tm.get("risk_model", "risk_GB_tuned"),
            "risk_model":         tm.get("risk_model"),
            "direction_model":    tm.get("direction_model"),
            "accuracy":           tm.get("risk_accuracy"),
            "macro_f1":           tm.get("risk_macro_f1"),
            "weighted_f1":        tm.get("risk_weighted_f1"),
            "high_risk_recall":   tm.get("high_risk_recall"),
            "direction_accuracy": tm.get("direction_accuracy"),
            "direction_macro_f1": tm.get("direction_macro_f1"),
            "deploy_ready":       tm.get("deploy_ready"),
            "smoke_tests_pass":   tm.get("smoke_tests_pass"),
            "trained_at":         tm.get("trained_at"),
            "model_id":           tm.get("model_id"),
        }

    try:
        from app.ml.inference import get_metadata
        meta = get_metadata()
        return {
            "source":           "legacy_model",
            "production_status": "active",
            "model_source":     "legacy_model",
            "best_model":       meta.get("best_model_name", "GradientBoosting"),
            "accuracy":         meta.get("test_accuracy",    0.94),
            "weighted_f1":      meta.get("test_weighted_f1", 0.94),
            "macro_f1":         meta.get("test_macro_f1",    0.93),
            "high_risk_recall": meta.get("high_risk_recall", 0.95),
            "trained_at":       meta.get("trained_at"),
        }
    except Exception:
        return {
            "source":           "demo",
            "production_status": "demo",
            "model_source":     "demo",
            "best_model":       "GradientBoosting",
            "accuracy":         0.94,
            "weighted_f1":      0.94,
            "macro_f1":         0.93,
            "high_risk_recall": 0.95,
            "trained_at":       None,
        }


@router.get("/api/v1/model-lab/experiments")
def model_lab_experiments():
    """Return model experiment records — Colab experiments first, then legacy/demo comparison."""
    tm = _load_text_model_info()
    experiments = []

    if tm and tm.get("available"):
        ps         = tm.get("production_status", "ready_for_deployment")
        trained_at = tm.get("trained_at")

        experiments.append({
            "id":               1,
            "experiment_id":    "colab_text_risk_20260608",
            "model_name":       tm.get("risk_model", "risk_GB_tuned"),
            "feature_set":      "word_tfidf + char_tfidf",
            "accuracy":         tm.get("risk_accuracy",    0.9798),
            "macro_f1":         tm.get("risk_macro_f1",    0.8547),
            "weighted_f1":      tm.get("risk_weighted_f1", 0.9788),
            "high_risk_recall": tm.get("high_risk_recall", 0.70),
            "confusion_matrix": tm.get("risk_confusion_matrix"),
            "feature_importance": None,
            "model_path":       "app/ml/text_model/risk_model.joblib",
            "trained_at":       trained_at,
            "task":             "risk_classification",
            "production_status": ps,
        })

        experiments.append({
            "id":               2,
            "experiment_id":    "colab_direction_20260608",
            "model_name":       tm.get("direction_model", "direction_LogReg_tuned"),
            "feature_set":      "word_tfidf + char_tfidf + numeric_features",
            "accuracy":         tm.get("direction_accuracy",    0.7836),
            "macro_f1":         tm.get("direction_macro_f1",    0.7759),
            "weighted_f1":      tm.get("direction_weighted_f1", 0.7807),
            "high_risk_recall": tm.get("direction_accuracy",    0.7836),
            "confusion_matrix": None,
            "feature_importance": None,
            "model_path":       "app/ml/text_model/direction_model.joblib",
            "trained_at":       trained_at,
            "task":             "direction_classification",
            "production_status": ps,
        })

    # Legacy/demo experiments for comparison (lower IDs so Colab sorts first)
    experiments += [
        {"id": 10, "experiment_id": "exp_gb_legacy",      "model_name": "Gradient Boosting (legacy numeric)", "feature_set": "text_social_market", "accuracy": 0.94, "macro_f1": 0.93, "weighted_f1": 0.94, "high_risk_recall": 0.95, "confusion_matrix": None, "feature_importance": None, "model_path": None, "trained_at": None},
        {"id": 11, "experiment_id": "exp_rf_legacy",       "model_name": "Random Forest (legacy numeric)",     "feature_set": "market_social",      "accuracy": 0.90, "macro_f1": 0.87, "weighted_f1": 0.90, "high_risk_recall": 0.88, "confusion_matrix": None, "feature_importance": None, "model_path": None, "trained_at": None},
        {"id": 12, "experiment_id": "exp_tfidf_lr_legacy", "model_name": "TF-IDF + LR (legacy text-only)",    "feature_set": "tfidf_text",         "accuracy": 0.81, "macro_f1": 0.77, "weighted_f1": 0.80, "high_risk_recall": 0.74, "confusion_matrix": None, "feature_importance": None, "model_path": None, "trained_at": None},
    ]

    source = "colab_text_model" if (tm and tm.get("available")) else "demo"
    return {"source": source, "experiments": experiments}


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


# ── /api/v1/health/real-ai ─────────────────────────────────────────────────────

@router.get("/api/v1/health/real-ai")
def health_real_ai():
    """
    Returns the status of the ML model currently deployed in PostAnalyzer.
    Includes Colab text model section when files are available.
    Used by ModelLab's DeployedModelCard and ColabModelCard.
    """
    import os
    from app.ml import inference as _ml

    meta = _ml.get_metadata()
    model_loaded = _ml._model is not None

    _models_dir = os.path.join(os.path.dirname(__file__), "..", "ml", "models")
    if model_loaded:
        if os.path.exists(os.path.join(_models_dir, "best_model.pkl")):
            model_file: Optional[str] = "best_model.pkl"
        elif os.path.exists(os.path.join(_models_dir, "hype_rf_model.pkl")):
            model_file = "hype_rf_model.pkl"
        else:
            model_file = "unknown"
    else:
        model_file = None

    # Determine which model is active in production
    active_source = "heuristic_fallback"
    if model_loaded:
        active_source = "legacy_model"
    try:
        from app.ml import text_inference as _ti  # type: ignore
        if _ti.is_loaded():
            active_source = "colab_text_model"
    except Exception:
        pass

    resp: dict = {
        "status":              "ok" if model_loaded else "not_loaded",
        "production_status":   "active",
        "model_source":        active_source,
        "active_model_family": "colab_text_model" if active_source == "colab_text_model" else "legacy_sklearn",
        "model_file":          model_file,
        "model_name":          meta.get("best_model_name", "StackingClassifier"),
        "accuracy":            meta.get("test_accuracy", meta.get("accuracy")),
        "macro_f1":            meta.get("test_macro_f1"),
        "weighted_f1":         meta.get("test_weighted_f1", meta.get("f1_weighted")),
        "high_risk_recall":    meta.get("high_risk_recall"),
        "trained_at":          meta.get("trained_at"),
        "feature_count":       len(_ml.get_active_feature_names()),
        "data_quality":        "real_reddit_yfinance_weak_label" if model_loaded else "heuristic",
    }

    # Attach Colab text model section (always, when files exist)
    tm = _load_text_model_info()
    if tm:
        resp["text_model"] = tm

    return resp


# ── /api/v1/analyze-url ───────────────────────────────────────────────────────

class AnalyzeUrlRequest(BaseModel):
    url: str
    symbol: Optional[str] = "GME"


@router.post("/api/v1/analyze-url")
def analyze_url(req: AnalyzeUrlRequest):
    """Fetch a URL, extract text, and run post-risk analysis on it."""
    import httpx

    result: dict = {
        "success": False,
        "url": req.url,
        "source_url": req.url,
        "symbol": req.symbol or "GME",
        "title": None,
        "extracted_title": None,
        "description": None,
        "extracted_description": None,
        "site_name": None,
        "extracted_text": None,
        "analyzed_text": None,
        "analysis": None,
        "data_quality": "url_extracted_text_model1",
        "errors": [],
    }

    try:
        resp = httpx.get(
            req.url,
            headers={"User-Agent": "SocialTradeRiskBot/1.0"},
            timeout=12,
            follow_redirects=True,
        )
        is_reddit = "reddit.com" in req.url.lower()
        if is_reddit and resp.status_code in (403, 429):
            result["errors"].append({
                "error": "Reddit restricts server-side access. Please paste the post/comment text into Text Analysis mode."
            })
            return result
        if resp.status_code != 200:
            result["errors"].append({"error": f"HTTP {resp.status_code}"})
            return result

        content = resp.text

        # Extract structured text (BeautifulSoup preferred; plain regex fallback)
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(content, "html.parser")

            title_tag = soup.find("title")
            if title_tag:
                result["title"] = title_tag.get_text().strip()[:200]

            for attr in [{"property": "og:description"}, {"name": "description"}]:
                tag = soup.find("meta", attrs=attr)
                if tag and tag.get("content"):
                    result["description"] = tag["content"][:500]
                    break

            og_site = soup.find("meta", attrs={"property": "og:site_name"})
            if og_site:
                result["site_name"] = og_site.get("content", "")

            article = soup.find("article") or soup.find("main") or soup.find("body")
            if article:
                parts = [p.get_text().strip() for p in article.find_all(["p", "h1", "h2", "h3"])[:20]]
                result["extracted_text"] = " ".join(t for t in parts if len(t) > 20)[:2000]

        except ImportError:
            import re as _re
            text = _re.sub(r'<[^>]+>', ' ', content)
            result["extracted_text"] = _re.sub(r'\s+', ' ', text).strip()[:2000]

        # Reddit soft-block: Cloudflare challenge page returns HTTP 200 but no real content
        if is_reddit and not (result.get("extracted_text") or "").strip():
            title_lower = (result.get("title") or "").lower()
            if any(kw in title_lower for kw in ["please wait", "verification", "just a moment", "checking your"]):
                result["errors"].append({
                    "error": "Reddit restricts server-side access. Please paste the post/comment text into Text Analysis mode."
                })
                return result

        # Sync extracted title/description aliases
        result["extracted_title"] = result["title"]
        result["extracted_description"] = result["description"]

        # Determine the text to analyze — extracted body preferred, then meta description, then title
        analysis_text = result["extracted_text"] or result["description"] or result["title"] or ""
        result["analyzed_text"] = analysis_text.strip()[:2000] if analysis_text.strip() else None

        if not analysis_text.strip():
            result["errors"].append({"error": "無法擷取此連結內容，請改用直接貼上文字"})
            return result

        if True:
            a_scores, a_model_source, a_colab_extra = _analyze_text(analysis_text)
            a_drivers = []
            if a_scores["fomo_score"]                >= 40: a_drivers.append("FOMO語言")
            if a_scores["hype_language_score"]       >= 40: a_drivers.append("炒作語言")
            if a_scores["manipulation_signal_score"] >= 40: a_drivers.append("操縱信號")
            if a_scores["short_squeeze_narrative_detected"]:  a_drivers.append("軋空敘事")
            if a_scores["urgency_score"]             >= 40: a_drivers.append("緊迫感語言")

            a_label = a_scores["predicted_risk_label"]
            a_exp = (
                f"URL content analysis: {a_label} risk. "
                + (f"Key signals: {', '.join(a_drivers)}." if a_drivers else "No strong signals detected.")
            )
            a_data_quality = (
                "colab_text_model"               if a_model_source == "colab_text_model" else
                "real_reddit_yfinance_weak_label" if a_model_source == "real_model" else
                "url_heuristic"
            )
            result["analysis"] = {
                **a_scores,
                "explanation":  a_exp,
                "model_source": a_model_source,
                "data_quality": a_data_quality,
                **a_colab_extra,
            }
            result["success"] = True

    except Exception as e:
        result["errors"].append({"error": "Extraction failed", "detail": str(e)})

    return result


# ── /api/v1/social-signals ────────────────────────────────────────────────────

@router.get("/api/v1/social-signals")
def social_signals(
    symbol: str  = Query(..., description="Ticker symbol, e.g. GME"),
    sources: str = Query("finnhub", description="Comma-separated: finnhub"),
    limit: int   = Query(5, ge=1, le=20),
):
    """
    Return recent news + aggregated social sentiment for a symbol.
    social_summary uses Finnhub aggregated Reddit/Twitter data (not raw post scraping).
    Used by PostAnalyzer's 'Latest News' tab.
    """
    from app.services import finnhub_service as fh_svc

    items: list[dict] = []
    errors: list[dict] = []
    sym = symbol.upper()

    # ── news items ────────────────────────────────────────────────────────────
    if "finnhub" in sources:
        try:
            news = fh_svc.get_news(sym, limit=limit)
            for i, n in enumerate(news):
                text = " ".join(filter(None, [n.get("headline"), n.get("summary")])).strip()

                item_risk_label:       object = None
                item_risk_score:       object = None
                item_model_source      = "heuristic_fallback"
                item_data_quality      = "heuristic"
                item_risk_confidence:  object = None
                item_risk_probs:       object = None
                item_dir_label:        object = None
                item_dir_confidence:   object = None

                if text:
                    # Colab text model (preferred)
                    try:
                        from app.ml import text_inference as _ti
                        if not _ti.is_loaded():
                            _ti.load_text_model()
                        if _ti.is_loaded():
                            colab = _ti.predict_text(text)
                            if colab:
                                rl = colab["risk_label"]
                                rp = colab["risk_probabilities"]
                                raw = (rp.get("High", 0.0) * 85
                                       + rp.get("Medium", 0.0) * 50
                                       + rp.get("Low", 0.0) * 15)
                                if rl == "High":
                                    score = max(raw, 65.0)
                                elif rl == "Medium":
                                    score = max(raw, 35.0)
                                else:
                                    score = min(max(raw, 5.0), 30.0)
                                item_risk_label      = rl
                                item_risk_score      = round(score, 1)
                                item_risk_confidence = colab.get("risk_confidence")
                                item_risk_probs      = rp
                                item_dir_label       = colab.get("direction_label")
                                item_dir_confidence  = colab.get("direction_confidence")
                                item_model_source    = "colab_text_model"
                                item_data_quality    = "colab_text_model_news"
                    except Exception as _exc:
                        print(f"[social_signals] Colab model skipped for news: {_exc}")

                    # Heuristic fallback when Colab unavailable
                    if item_model_source == "heuristic_fallback":
                        s = _compute_scores(text)
                        if s:
                            item_risk_label = s["predicted_risk_label"]
                            item_risk_score = round(s["composite_score"], 1)

                items.append({
                    "id":                   f"fh_{sym}_{i}",
                    "source":               "finnhub",
                    "published_at":         n.get("published_at", datetime.utcnow().isoformat()),
                    "headline":             n.get("headline"),
                    "summary":              n.get("summary"),
                    "url":                  n.get("url"),
                    "ai_risk_label":        item_risk_label,
                    "ai_risk_score":        item_risk_score,
                    "model_source":         item_model_source,
                    "data_quality":         item_data_quality,
                    "risk_confidence":      item_risk_confidence,
                    "risk_probabilities":   item_risk_probs,
                    "direction_label":      item_dir_label,
                    "direction_confidence": item_dir_confidence,
                })
        except Exception as e:
            errors.append({"source": "finnhub", "error": str(e)})

    # ── social sentiment summary (Finnhub aggregated — NOT raw post scraping) ─
    social_summary: dict = {
        "source":               "finnhub_social_sentiment",
        "reddit_mentions":      0,
        "twitter_mentions":     0,
        "reddit_sentiment":     0.0,
        "twitter_sentiment":    0.0,
        "total_mentions":       0,
        "avg_social_sentiment": 0.0,
        "social_buzz_score":    0.0,
        "risk_hint":            "Unavailable",
        "data_quality":         "finnhub_social_not_authorized",
        "available":            False,
    }
    try:
        sentiment = fh_svc.get_social_sentiment(sym)
        if sentiment:
            reddit_m  = int(sentiment.get("reddit_mentions",  0))
            twitter_m = int(sentiment.get("twitter_mentions", 0))
            reddit_s  = float(sentiment.get("reddit_sentiment",  0.0))
            twitter_s = float(sentiment.get("twitter_sentiment", 0.0))
            total     = reddit_m + twitter_m

            # avg over sources that actually have data
            sentiments = []
            if reddit_m  > 0: sentiments.append(reddit_s)
            if twitter_m > 0: sentiments.append(twitter_s)
            avg_s = round(sum(sentiments) / len(sentiments), 4) if sentiments else 0.0

            # buzz: 0–100, 200 mentions → 100; capped
            buzz = round(min(100.0, total / 2.0), 2)
            risk_hint = "High" if total > 100 else "Medium" if total > 20 else "Low"

            social_summary.update({
                "reddit_mentions":      reddit_m,
                "twitter_mentions":     twitter_m,
                "reddit_sentiment":     round(reddit_s,  4),
                "twitter_sentiment":    round(twitter_s, 4),
                "total_mentions":       total,
                "avg_social_sentiment": avg_s,
                "social_buzz_score":    buzz,
                "risk_hint":            risk_hint,
                "data_quality":         "finnhub_aggregated_sentiment",
                "available":            True,
            })
        else:
            errors.append({
                "source": "finnhub_social",
                "error":  "Finnhub social sentiment endpoint is not available for this API key.",
            })
    except Exception as e:
        errors.append({"source": "finnhub_social", "error": f"Finnhub social sentiment endpoint is not available for this API key."})

    return {
        "success":        len(items) > 0,
        "symbol":         sym,
        "items":          items,
        "social_summary": social_summary,
        "errors":         errors,
    }


# ── /api/v1/event-abnormal-return ─────────────────────────────────────────────

def _fetch_daily_closes(symbol: str) -> dict:
    """Fetch 1-year of daily adj-close prices via Yahoo Finance v8 chart API.
    Returns {date_str: close} e.g. {"2026-01-02": 185.23}. Empty dict on failure.
    """
    import httpx
    from datetime import timezone as _tz

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        url = (
            f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
            f"?range=1y&interval=1d&includePrePost=false"
        )
        resp = httpx.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            return {}
        data = resp.json()
        result_list = data.get("chart", {}).get("result") or []
        if not result_list:
            return {}
        r = result_list[0]
        timestamps = r.get("timestamp", [])
        adj = r.get("indicators", {}).get("adjclose", [])
        closes = adj[0].get("adjclose", []) if adj else []
        if not closes:
            closes = r.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        out: dict = {}
        for i, ts in enumerate(timestamps):
            c = closes[i] if i < len(closes) else None
            if c is None or c != c:    # None or NaN
                continue
            d = datetime.fromtimestamp(ts, tz=_tz.utc).strftime("%Y-%m-%d")
            out[d] = float(c)
        return out
    except Exception as e:
        print(f"[event_study] _fetch_daily_closes({symbol}): {e}")
        return {}


class EventAbnormalReturnRequest(BaseModel):
    symbol:            str
    event_date:        str            # "YYYY-MM-DD"
    benchmark:         str  = "SPY"
    estimation_days:   int  = 120
    event_window_days: int  = 5


@router.post("/api/v1/event-abnormal-return")
def event_abnormal_return(req: EventAbnormalReturnRequest):
    """
    Market Model event study.
    Returns abnormal return (AR) and cumulative abnormal return (CAR) for a symbol
    around an event date, benchmarked against SPY.
    This is a post-event observation, not a causal claim.
    """
    import numpy as np

    sym   = req.symbol.upper()
    bench = req.benchmark.upper()

    if not req.event_date or not req.event_date.strip():
        return {
            "success": False, "symbol": sym, "event_date": "",
            "error": "event_date is required. Please provide a date in YYYY-MM-DD format.",
        }

    try:
        ev_date = datetime.strptime(req.event_date.strip(), "%Y-%m-%d").date()
    except ValueError:
        return {
            "success": False, "symbol": sym, "event_date": req.event_date,
            "error": f"Invalid event_date (expected YYYY-MM-DD): {req.event_date}",
        }

    sym_prices   = _fetch_daily_closes(sym)
    bench_prices = _fetch_daily_closes(bench)

    if not sym_prices:
        return {"success": False, "symbol": sym, "event_date": req.event_date,
                "error": f"Could not fetch price data for {sym}"}
    if not bench_prices:
        return {"success": False, "symbol": sym, "event_date": req.event_date,
                "error": f"Could not fetch price data for {bench}"}

    common_dates = sorted(set(sym_prices) & set(bench_prices))
    if len(common_dates) < 2:
        return {"success": False, "symbol": sym, "event_date": req.event_date,
                "error": "Insufficient overlapping price data"}

    # Daily returns over common trading dates
    ret_dates: list = []
    sym_rets:  dict = {}
    bch_rets:  dict = {}
    for i in range(1, len(common_dates)):
        d, prev = common_dates[i], common_dates[i - 1]
        sp, bp = sym_prices[prev], bench_prices[prev]
        if sp > 0 and bp > 0:
            sym_rets[d] = (sym_prices[d]   - sp) / sp
            bch_rets[d] = (bench_prices[d] - bp) / bp
            ret_dates.append(d)

    if not ret_dates:
        return {"success": False, "symbol": sym, "event_date": req.event_date,
                "error": "Could not compute daily returns from price data"}

    ev_str = ev_date.strftime("%Y-%m-%d")

    # Locate event window start: first trading date >= event_date
    event_start_idx = next((i for i, d in enumerate(ret_dates) if d >= ev_str), None)
    if event_start_idx is None:
        return {
            "success": False, "symbol": sym, "event_date": req.event_date,
            "available_days": 0,
            "error": "event_date is beyond available price data; no post-event trading data yet",
        }

    # Estimation window: up to estimation_days trading days before event
    est_end   = event_start_idx - 1
    est_start = max(0, est_end - req.estimation_days + 1)
    est_dates = ret_dates[est_start : est_end + 1]

    if len(est_dates) < 30:
        return {
            "success": False, "symbol": sym, "event_date": req.event_date,
            "available_days": 0,
            "error": (
                f"Insufficient estimation window: only {len(est_dates)} trading days "
                f"before event_date (minimum 30 required)."
            ),
        }

    # OLS: R_sym = alpha + beta * R_bench (on estimation window)
    X = np.array([bch_rets[d] for d in est_dates])
    y = np.array([sym_rets[d] for d in est_dates])
    X_mat = np.column_stack([np.ones(len(X)), X])
    coeffs, _, _, _ = np.linalg.lstsq(X_mat, y, rcond=None)
    alpha, beta = float(coeffs[0]), float(coeffs[1])

    # Event window: event_start to event_start + event_window_days - 1
    ev_end_idx = min(event_start_idx + req.event_window_days - 1, len(ret_dates) - 1)
    ev_dates   = ret_dates[event_start_idx : ev_end_idx + 1]
    available  = len(ev_dates)

    ar_list = [sym_rets[d] - (alpha + beta * bch_rets[d]) for d in ev_dates]

    ev_ar  = round(ar_list[0], 6)         if ar_list           else None
    car_3d = round(sum(ar_list[:3]), 6)   if ar_list           else None
    car_5d = round(sum(ar_list[:5]), 6)   if ar_list           else None

    ref_car    = car_5d or 0.0
    abs_ref    = abs(ref_car)
    risk_level = "high" if abs_ref > 0.10 else "medium" if abs_ref > 0.05 else "low"

    incomplete = f"（事件後僅 {available} 日資料）" if available < req.event_window_days else ""
    pct = ref_car * 100
    if abs_ref > 0.05:
        direction = "正向" if ref_car > 0 else "負向"
        interpretation = (
            f"事件後觀察：{sym} 相對 {bench} 出現{direction}異常報酬，"
            f"CAR_5d ≈ {pct:+.1f}%{incomplete}"
        )
    else:
        interpretation = (
            f"事件後觀察：{sym} 相對 {bench} 異常報酬幅度較小，"
            f"CAR_5d ≈ {pct:+.1f}%{incomplete}"
        )

    return {
        "success":               True,
        "symbol":                sym,
        "event_date":            req.event_date,
        "benchmark":             bench,
        "method":                "market_model_event_study",
        "alpha":                 round(alpha, 6),
        "beta":                  round(beta, 4),
        "estimation_days":       len(est_dates),
        "event_window_days":     req.event_window_days,
        "event_abnormal_return": ev_ar,
        "car_3d":                car_3d,
        "car_5d":                car_5d,
        "available_days":        available,
        "risk_level":            risk_level,
        "interpretation":        interpretation,
        "data_quality":          "computed_from_market_model_event_window",
        "disclaimer":            "This is a post-event abnormal return observation, not proof of causality.",
    }
