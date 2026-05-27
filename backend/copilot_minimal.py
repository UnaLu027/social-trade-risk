from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Social Trading Risk Copilot Minimal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "https://unalu027.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PostAnalyzeRequest(BaseModel):
    text: str
    symbol: str = "GME"

class StressTestRequest(BaseModel):
    mention_growth: float = 2.5
    influencer_power: float = 0.8
    fanatic_ratio: float = 0.35
    short_interest: float = 0.6
    volume_spike: float = 3.0
    trading_restriction: bool = False
    rational_investor_ratio: float = 0.25

def risk_label(score):
    if score >= 80:
        return "Critical"
    if score >= 60:
        return "High"
    if score >= 35:
        return "Medium"
    return "Low"

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "copilot_minimal"
    }

@app.get("/api/v1/health/product")
def product_health():
    return {
        "product_mode": "minimal_local_copilot",
        "fastapi_ok": True,
        "model_loaded": "rule_based_fallback",
        "demo_mode": True
    }

@app.post("/api/v1/post-analyze")
def post_analyze(payload: PostAnalyzeRequest):
    text = payload.text.lower()

    hype_terms = ["to the moon", "moon", "rocket", "diamond hands", "squeeze"]
    urgency_terms = ["buy now", "before it explodes", "urgent", "now"]
    manipulation_terms = ["shorts are trapped", "everyone buy", "force the squeeze"]

    hype_hits = sum(1 for t in hype_terms if t in text)
    urgency_hits = sum(1 for t in urgency_terms if t in text)
    manipulation_hits = sum(1 for t in manipulation_terms if t in text)
    squeeze_detected = "squeeze" in text or "shorts are trapped" in text

    risk_score = min(
        100,
        hype_hits * 20
        + urgency_hits * 20
        + manipulation_hits * 25
        + (15 if squeeze_detected else 0)
    )

    label = risk_label(risk_score)

    highlighted_terms = []
    for term in hype_terms:
        if term in text:
            highlighted_terms.append(term)
    for term in urgency_terms:
        if term in text:
           highlighted_terms.append(term)
    for term in manipulation_terms:
        if term in text:
            highlighted_terms.append(term)

    return {
        "sentiment_score": 0.75,
        "bullish_probability": 0.9,
        "bearish_probability": 0.1,
        "fomo_score": min(1, (hype_hits + urgency_hits) / 4),
        "hype_language_score": min(1, hype_hits / 3),
        "manipulation_signal_score": min(1, manipulation_hits / 2),
        "urgency_score": min(1, urgency_hits / 2),
        "short_squeeze_narrative_detected": squeeze_detected,
        "predicted_risk_label": label,
        "explanation": f"This post is classified as {label} because it contains hype, urgency, and short-squeeze language.",
        "highlighted_terms": highlighted_terms,
        "model_source": "rule_based_minimal_fallback",
        "data_quality": "demo"
    }

@app.post("/api/v1/stress-test")
def stress_test(payload: StressTestRequest):
    score = (
        payload.mention_growth * 16
        + payload.influencer_power * 22
        + payload.fanatic_ratio * 20
        + payload.short_interest * 24
        + payload.volume_spike * 10
        - payload.rational_investor_ratio * 15
    )

    if payload.trading_restriction:
        score += 8

    score = max(0, min(100, score))
    label = risk_label(score)

    belief_curve = []
    price_curve = []

    belief = 20 + payload.fanatic_ratio * 30
    price = 100

    for step in range(10):
        belief = min(
            100,
            belief
            + payload.mention_growth * 2
            + payload.influencer_power * 3
            - payload.rational_investor_ratio * 1.5
        )

        price = max(
            40,
            price * (1 + (belief / 100 - 0.45) * 0.08)
        )

        # 重點：前端 StressTest.tsx 目前期待純數字，所以不要回傳 object
        belief_curve.append(round(belief / 100, 4))
        price_curve.append(round(price, 2))

    return {
        "simulated_risk_score": round(score, 2),
        "simulated_risk_label": label,
        "belief_curve": belief_curve,
        "price_curve": price_curve,
	"key_drivers": [
    		f"short_interest: {payload.short_interest:.2f}",
    		f"influencer_power: {payload.influencer_power:.2f}",
    		f"mention_growth: {payload.mention_growth:.2f}",
    		f"fanatic_ratio: {payload.fanatic_ratio:.2f}",
	],
        "explanation": (
            f"Risk is {label}. The score rises when short interest, "
            f"influencer power, mention growth, and fanatic ratio increase."
        )
    }