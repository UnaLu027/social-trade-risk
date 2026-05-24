"""
Fake News Detection API router.
"""
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/fake-news", tags=["fake-news"])


class FakeNewsRequest(BaseModel):
    text: str
    url: Optional[str] = None


class FeatureDetail(BaseModel):
    name: str
    value: float
    importance: float
    impact: str


class FakeNewsResponse(BaseModel):
    fake_probability: float
    label: str
    confidence: float
    contributing_features: list[FeatureDetail]
    stock_mentions: list[str]
    analysis_text: str


def _build_analysis_text(label: str, fake_probability: float, features: list[dict], stock_mentions: list[str]) -> str:
    """Generate a human-readable Chinese explanation."""
    pct = round(fake_probability * 100, 1)

    if label == "fake":
        verdict = f"此內容被判定為可疑假新聞（可信度：{100 - pct:.1f}%）。"
        reason_parts = []
        for f in features[:4]:
            name = f["name"]
            val = f["value"]
            impact = f["impact"]
            if impact == "fake_signal":
                if name == "uppercase_ratio":
                    reason_parts.append(f"大寫字母比例偏高（{val:.1%}）")
                elif name == "exclamation_count":
                    reason_parts.append(f"驚嘆號數量異常（{int(val)} 個）")
                elif name == "sentiment_extremity":
                    reason_parts.append(f"情感極端化程度高（{val:.2f}）")
                elif name == "stock_mention_count":
                    reason_parts.append(f"提及多支股票（{int(val)} 支）")
        if reason_parts:
            verdict += "主要原因：" + "、".join(reason_parts) + "。"
        if stock_mentions:
            verdict += f"偵測到相關股票代號：{', '.join(stock_mentions)}。"
        verdict += "建議交叉比對多個可信新聞來源後再做投資決策。"
    elif label == "real":
        verdict = f"此內容看起來較為可信（真實新聞機率：{100 - pct:.1f}%）。"
        verdict += "文章語氣客觀，措辭專業，符合正規財經新聞特徵。"
        if stock_mentions:
            verdict += f"涉及股票：{', '.join(stock_mentions)}。"
        verdict += "即使如此，仍建議參考多方資料來源進行投資判斷。"
    else:
        verdict = f"此內容難以明確判定真偽（假新聞機率：{pct:.1f}%）。"
        verdict += "部分指標顯示可信，部分指標顯示可疑，請謹慎評估。"
        if stock_mentions:
            verdict += f"涉及股票：{', '.join(stock_mentions)}。"
        verdict += "建議查閱原始來源並比對多家媒體的報導。"

    return verdict


@router.post("/analyze", response_model=FakeNewsResponse)
def analyze_fake_news(body: FakeNewsRequest):
    """Analyze text for fake news indicators."""
    from app.ml.fakenews.inference_fakenews import predict_fakenews

    result = predict_fakenews(body.text, url=body.url or "")

    analysis_text = _build_analysis_text(
        label=result["label"],
        fake_probability=result["fake_probability"],
        features=result["contributing_features"],
        stock_mentions=result["stock_mentions"],
    )

    return FakeNewsResponse(
        fake_probability=result["fake_probability"],
        label=result["label"],
        confidence=result["confidence"],
        contributing_features=[FeatureDetail(**f) for f in result["contributing_features"]],
        stock_mentions=result["stock_mentions"],
        analysis_text=analysis_text,
    )
