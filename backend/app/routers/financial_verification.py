from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.twse_financial_service import (
    FinancialDataUnavailable,
    SEMICONDUCTOR_PEERS,
    extract_claim,
    get_company_snapshot,
    get_peer_snapshots,
    verify_claim,
)

router = APIRouter(prefix="/api/v1/financial", tags=["financial-verification"])


class ClaimExtractionRequest(BaseModel):
    text: str = Field(min_length=2, max_length=5000)
    company_code: str | None = None


class ClaimVerificationRequest(BaseModel):
    text: str = Field(min_length=2, max_length=5000)
    company_code: str | None = None


@router.get("/health")
async def financial_health():
    return {
        "status": "ok",
        "module": "semiconductor_financial_evidence_mvp",
        "official_source": "TWSE OpenAPI",
        "historical_xbrl_enabled": False,
        "scope": "wafer_foundry",
        "supported_companies": list(SEMICONDUCTOR_PEERS.keys()),
    }


@router.get("/companies")
async def list_companies():
    return {
        "subindustry": "晶圓代工",
        "companies": [
            {
                "company_code": code,
                "company_name": profile["name"],
                "english_name": profile["english_name"],
                "subindustry": profile["subindustry"],
            }
            for code, profile in SEMICONDUCTOR_PEERS.items()
        ],
    }


@router.get("/snapshot/{company_code}")
async def company_snapshot(company_code: str):
    try:
        return await get_company_snapshot(company_code)
    except FinancialDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/peers")
async def peer_snapshots():
    return {
        "subindustry": "晶圓代工",
        "data_coverage": "latest_twse_snapshot",
        "companies": await get_peer_snapshots(),
        "disclaimer": "同群比較僅供資訊查證與異常觀察，不代表投資評等。",
    }


@router.post("/extract-claim")
async def extract_financial_claim(payload: ClaimExtractionRequest):
    claim = extract_claim(payload.text, payload.company_code)
    return {
        "claim": claim.__dict__,
        "supported_scope": "台積電、聯電、力積電之最新官方財務快照",
    }


@router.post("/verify-claim")
async def verify_financial_claim(payload: ClaimVerificationRequest):
    try:
        result = await verify_claim(payload.text, payload.company_code)
    except FinancialDataUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    result["disclaimer"] = (
        "本模組僅以公開財務資料協助驗證可量化主張，不提供買賣建議、"
        "估值結論或未來股價預測。"
    )
    return result
