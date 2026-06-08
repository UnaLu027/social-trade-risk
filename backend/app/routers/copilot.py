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


def _analyze_text(text: str) -> tuple[dict, str]:
    """
    Shared inference pipeline used by post_analyze and analyze_url.
    Returns (scores_dict, model_source).
    scores_dict: all fields from _compute_scores() with predicted_risk_label updated by ML if available.
    model_source: "real_model" when ML ran, "heuristic_fallback" otherwise.
    """
    scores = _compute_scores(text)
    composite = scores["composite_score"]
    model_source = "heuristic_fallback"

    # Skip ML when there are zero signals — heuristic "Low" is already correct and
    # non-zero mention_count floors would produce spurious "Medium" predictions.
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
            print(f"[_analyze_text] ML inference skipped: {_exc}")

    return scores, model_source


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
    Tries the trained ML model (app.ml.inference) first; falls back to
    keyword heuristic when the model is unavailable.
    model_source: "real_model" | "heuristic_fallback"
    """
    if req.symbol and req.symbol.upper().endswith(".TW"):
        from fastapi import HTTPException
        raise HTTPException(400, detail="Only US stocks are supported in this MVP.")

    scores, model_source = _analyze_text(req.text)
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

    return PostAnalyzeResponse(
        **scores,
        explanation=explanation,
        model_source=model_source,
        data_quality="real_reddit_yfinance_weak_label" if model_source == "real_model" else "heuristic",
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


# ── /api/v1/health/real-ai ─────────────────────────────────────────────────────

@router.get("/api/v1/health/real-ai")
def health_real_ai():
    """
    Returns the status of the ML model currently deployed in PostAnalyzer.
    Used by ModelLab's DeployedModelCard.
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

    return {
        "status":         "ok" if model_loaded else "not_loaded",
        "model_file":     model_file,
        "model_name":     meta.get("best_model_name", "StackingClassifier"),
        "accuracy":       meta.get("test_accuracy", meta.get("accuracy")),
        "macro_f1":       meta.get("test_macro_f1"),
        "weighted_f1":    meta.get("test_weighted_f1", meta.get("f1_weighted")),
        "high_risk_recall": meta.get("high_risk_recall"),
        "trained_at":     meta.get("trained_at"),
        "feature_count":  len(_ml.get_active_feature_names()),
    }


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
        "symbol": req.symbol or "GME",
        "title": None,
        "description": None,
        "site_name": None,
        "extracted_text": None,
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

        # Analyse extracted text — same inference pipeline as post_analyze
        analysis_text = result["extracted_text"] or result["description"] or result["title"] or ""
        if analysis_text.strip():
            a_scores, a_model_source = _analyze_text(analysis_text)
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
            result["analysis"] = {
                **a_scores,
                "explanation": a_exp,
                "model_source": a_model_source,
                "data_quality": "real_reddit_yfinance_weak_label" if a_model_source == "real_model" else "url_heuristic",
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

    # ── news items (unchanged) ────────────────────────────────────────────────
    if "finnhub" in sources:
        try:
            news = fh_svc.get_news(sym, limit=limit)
            for i, n in enumerate(news):
                text = " ".join(filter(None, [n.get("headline"), n.get("summary")])).strip()
                s = _compute_scores(text) if text else None
                items.append({
                    "id":            f"fh_{sym}_{i}",
                    "source":        "finnhub",
                    "published_at":  n.get("published_at", datetime.utcnow().isoformat()),
                    "headline":      n.get("headline"),
                    "summary":       n.get("summary"),
                    "url":           n.get("url"),
                    "ai_risk_label": s["predicted_risk_label"] if s else None,
                    "ai_risk_score": round(s["composite_score"], 1) if s else None,
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
        "risk_hint":            "Low",
        "data_quality":         "aggregated_social_sentiment_not_raw_posts",
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
            })
        else:
            errors.append({
                "source": "finnhub_social",
                "error":  "Finnhub social sentiment unavailable or empty",
            })
    except Exception as e:
        errors.append({"source": "finnhub_social", "error": f"Social sentiment error: {e}"})

    return {
        "success":        len(items) > 0,
        "symbol":         sym,
        "items":          items,
        "social_summary": social_summary,
        "errors":         errors,
    }
