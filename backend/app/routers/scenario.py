from fastapi import APIRouter
from app.schemas.scenario import ScenarioRequest, ScenarioResponse, ComparableEvent
from app.ml.feature_engineering import build_feature_row, identify_top_drivers, LABEL_MAP, LABEL_TEXT_MAP
from app.ml import inference

router = APIRouter(prefix="/api/v1/scenario", tags=["scenario"])

_COMPARABLE_EVENTS = {
    2: ComparableEvent(ticker="GME", date="2021-01-25", similarity_pct=84.0),
    1: ComparableEvent(ticker="AMC", date="2021-06-02", similarity_pct=71.0),
    0: ComparableEvent(ticker="MSFT", date="2023-01-18", similarity_pct=62.0),
}

_EXPLANATIONS = {
    2: (
        "High short interest ({short_interest:.0%}) combined with elevated social momentum creates "
        "conditions similar to GME Jan 2021. The ensemble model assigns {prob:.0%} probability to "
        "the high-risk outcome. Key drivers: {drivers}."
    ),
    1: (
        "Moderate social activity and volume signal are above baseline but below squeeze thresholds. "
        "The model assigns {prob:.0%} probability to medium risk. Monitor for escalation in mention velocity."
    ),
    0: (
        "All indicators are within normal operating ranges. "
        "Social sentiment is balanced and volume is not elevated. "
        "Low-risk outcome with {prob:.0%} model confidence."
    ),
}


@router.post("/simulate", response_model=ScenarioResponse)
def simulate_scenario(body: ScenarioRequest):
    features = build_feature_row(
        mention_count_1h=int(body.mention_growth * 100),
        mention_count_24h=int(body.mention_growth * 100 * 18),
        mention_growth_ratio=body.mention_growth,
        bullish_ratio=body.bullish_ratio,
        avg_sentiment=body.bullish_ratio * 0.8 - 0.1,
        influencer_score=body.influencer_activity * 1000,
        price_change_pct_1h=min(body.mention_growth * 0.05, 0.5),
        price_change_pct_24h=min(body.mention_growth * 0.12, 1.0),
        volume_spike_ratio=max(body.option_activity * 0.8, 1.0),
        short_interest_ratio=body.short_interest,
        option_volume_spike=body.option_activity,
    )

    # Honor the manual hype_score override from the frontend slider.
    # build_feature_row() auto-computes hype_score_raw from the other signals;
    # the slider lets the user directly override it for "what-if" analysis.
    features["hype_score_raw"] = float(body.hype_score)

    if body.trading_restriction:
        features["mention_growth_ratio"] *= 1.5
        features["hype_score_raw"] = min(features["hype_score_raw"] * 1.3, 100)

    result = inference.predict_risk(features)
    label = result["label"]
    probs = result["probabilities"]
    label_keys = ["low", "medium", "high"]
    prob_dict = {k: round(v, 3) for k, v in zip(label_keys, probs)}
    dominant_prob = probs[label]

    drivers = identify_top_drivers(features, features["hype_score_raw"])
    dominant_factor = drivers[0] if drivers else "No dominant factor"

    explanation = _EXPLANATIONS[label].format(
        short_interest=body.short_interest,
        prob=dominant_prob,
        drivers=", ".join(drivers[:3]),
    )

    return ScenarioResponse(
        risk_label=label_keys[label],
        risk_label_text=LABEL_TEXT_MAP[label],
        risk_probabilities=prob_dict,
        hype_score_computed=round(features["hype_score_raw"], 1),
        dominant_factor=dominant_factor,
        explanation=explanation,
        comparable_event=_COMPARABLE_EVENTS.get(label),
    )
