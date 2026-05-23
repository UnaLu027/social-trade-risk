from pydantic import BaseModel, Field


class ScenarioRequest(BaseModel):
    mention_growth: float = Field(1.0, ge=0.0, le=10.0)
    bullish_ratio: float = Field(0.5, ge=0.0, le=1.0)
    hype_score: float = Field(50.0, ge=0.0, le=100.0)
    influencer_activity: float = Field(0.3, ge=0.0, le=1.0)
    short_interest: float = Field(0.1, ge=0.0, le=1.0)
    option_activity: float = Field(1.0, ge=0.0, le=5.0)
    trading_restriction: bool = False


class ComparableEvent(BaseModel):
    ticker: str
    date: str
    similarity_pct: float


class ScenarioResponse(BaseModel):
    risk_label: str
    risk_label_text: str
    risk_probabilities: dict[str, float]
    hype_score_computed: float
    dominant_factor: str
    explanation: str
    comparable_event: ComparableEvent | None = None
