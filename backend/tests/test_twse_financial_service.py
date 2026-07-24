import pytest

from app.services import twse_financial_service as service


@pytest.fixture
def official_rows():
    income = [
        {
            "公司代號": "2330",
            "公司名稱": "台積電",
            "報告年/季": "115/1",
            "營業收入": "1,000",
            "營業毛利（毛損）": "600",
            "營業利益（損失）": "450",
            "本期淨利（淨損）": "400",
            "基本每股盈餘（元）": "15.50",
        }
    ]
    balance = [
        {
            "公司代號": "2330",
            "公司名稱": "台積電",
            "報告年/季": "115/1",
            "流動資產": "900",
            "資產總額": "2,000",
            "流動負債": "500",
            "負債總額": "800",
            "權益總額": "1,200",
        }
    ]
    monthly = [
        {
            "公司代號": "2330",
            "公司名稱": "台積電",
            "資料年月": "11506",
            "營業收入-當月營收": "150",
            "營業收入-去年當月營收": "100",
            "營業收入-去年同月增減(%)": "50.00",
        }
    ]
    return {
        service.INCOME_ENDPOINT: income,
        service.BALANCE_ENDPOINT: balance,
        service.MONTHLY_REVENUE_ENDPOINT: monthly,
    }


@pytest.mark.asyncio
async def test_snapshot_calculates_transparent_ratios(monkeypatch, official_rows):
    async def fake_fetch(path):
        return official_rows[path]

    monkeypatch.setattr(service, "_fetch_dataset", fake_fetch)
    snapshot = await service.get_company_snapshot("2330")

    assert snapshot["income_statement"]["gross_margin_pct"] == 60.0
    assert snapshot["income_statement"]["operating_margin_pct"] == 45.0
    assert snapshot["balance_sheet"]["debt_ratio_pct"] == 40.0
    assert snapshot["balance_sheet"]["current_ratio_pct"] == 180.0
    assert snapshot["monthly_revenue"]["yoy_pct"] == 50.0


@pytest.mark.asyncio
async def test_claim_supported_when_official_value_matches(monkeypatch, official_rows):
    async def fake_fetch(path):
        return official_rows[path]

    monkeypatch.setattr(service, "_fetch_dataset", fake_fetch)
    result = await service.verify_claim("台積電最新月營收年增 50%")

    assert result["verdict"] == "supported"
    assert result["risk_level"] == "low"
    assert result["evidence"]["actual_value"] == 50.0


@pytest.mark.asyncio
async def test_claim_contradicted_when_gap_is_large(monkeypatch, official_rows):
    async def fake_fetch(path):
        return official_rows[path]

    monkeypatch.setattr(service, "_fetch_dataset", fake_fetch)
    result = await service.verify_claim("台積電最新月營收年增 80%")

    assert result["verdict"] == "contradicted"
    assert result["risk_level"] == "high"


def test_claim_extraction_stays_inside_wafer_foundry_scope():
    claim = service.extract_claim("聯電最新毛利率為 35%")
    assert claim.company_code == "2303"
    assert claim.metric == "gross_margin_pct"
    assert claim.claimed_value == 35.0
