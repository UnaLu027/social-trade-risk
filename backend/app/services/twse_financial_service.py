"""TWSE financial evidence service for the semiconductor MVP.

The service intentionally uses official public endpoints without an API key.  It
fetches the latest listed-company income statement, balance sheet, and monthly
revenue snapshots, filters them to the MVP peer group, normalises numeric fields,
and calculates transparent ratios in Python.

The TWSE OpenAPI datasets are snapshot datasets.  Historical XBRL ingestion will
be added separately; every response therefore exposes the exact source period and
coverage so the UI never implies that older periods were checked when they were
not.
"""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass
from typing import Any, Iterable

import httpx

TWSE_BASE_URL = "https://openapi.twse.com.tw/v1"
INCOME_ENDPOINT = "/opendata/t187ap06_L_ci"
BALANCE_ENDPOINT = "/opendata/t187ap07_L_ci"
MONTHLY_REVENUE_ENDPOINT = "/opendata/t187ap05_L"

# Keep the first MVP inside one comparable sub-industry: wafer foundries.
SEMICONDUCTOR_PEERS: dict[str, dict[str, Any]] = {
    "2330": {
        "name": "台積電",
        "english_name": "TSMC",
        "subindustry": "晶圓代工",
        "aliases": ["台積電", "台灣積體電路", "TSMC", "2330"],
    },
    "2303": {
        "name": "聯電",
        "english_name": "UMC",
        "subindustry": "晶圓代工",
        "aliases": ["聯電", "聯華電子", "UMC", "2303"],
    },
    "6770": {
        "name": "力積電",
        "english_name": "PSMC",
        "subindustry": "晶圓代工",
        "aliases": ["力積電", "力晶積成電子", "PSMC", "6770"],
    },
}

_CACHE_TTL_SECONDS = 60 * 30
_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


class FinancialDataUnavailable(RuntimeError):
    """Raised when official TWSE data cannot be retrieved or matched."""


@dataclass(frozen=True)
class ExtractedClaim:
    company_code: str | None
    company_name: str | None
    metric: str | None
    claimed_value: float | None
    unit: str | None
    comparison: str | None
    direction: str | None
    original_text: str


def _clean_key(value: str) -> str:
    return re.sub(r"[\s（）()\-—_／/]", "", value or "")


def _parse_number(value: Any) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "").replace("％", "%")
    if text in {"", "-", "--", "－", "N/A", "NA", "null", "None"}:
        return None
    text = text.replace("%", "")
    # Accounting negatives are sometimes written as (123).
    if text.startswith("(") and text.endswith(")"):
        text = f"-{text[1:-1]}"
    try:
        return float(text)
    except ValueError:
        match = re.search(r"-?\d+(?:\.\d+)?", text)
        return float(match.group(0)) if match else None


def _pick(row: dict[str, Any] | None, candidates: Iterable[str]) -> Any:
    if not row:
        return None
    for candidate in candidates:
        if candidate in row:
            return row[candidate]

    cleaned = {_clean_key(str(k)): v for k, v in row.items()}
    for candidate in candidates:
        key = _clean_key(candidate)
        if key in cleaned:
            return cleaned[key]

    # Fall back to substring matching because TWSE occasionally adjusts brackets
    # or punctuation in Chinese field labels while keeping the semantic wording.
    for candidate in candidates:
        needle = _clean_key(candidate)
        for key, value in cleaned.items():
            if needle and needle in key:
                return value
    return None


def _company_code(row: dict[str, Any]) -> str:
    value = _pick(row, ["公司代號", "公司代碼", "Code"])
    return str(value or "").strip()


async def _fetch_dataset(path: str) -> list[dict[str, Any]]:
    cached = _cache.get(path)
    now = time.time()
    if cached and now - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1]

    headers = {
        "Accept": "application/json",
        "User-Agent": "FinancialCredibilityMVP/1.0 (academic project)",
    }
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            response = await client.get(f"{TWSE_BASE_URL}{path}", headers=headers)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise FinancialDataUnavailable(f"TWSE OpenAPI request failed for {path}: {exc}") from exc

    if not isinstance(payload, list):
        raise FinancialDataUnavailable(f"Unexpected TWSE response shape for {path}")

    rows = [row for row in payload if isinstance(row, dict)]
    _cache[path] = (now, rows)
    return rows


def _find_company_row(rows: list[dict[str, Any]], code: str) -> dict[str, Any] | None:
    return next((row for row in rows if _company_code(row) == code), None)


def _safe_ratio(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in {None, 0}:
        return None
    return round(numerator / denominator * 100, 2)


def _period_from_row(row: dict[str, Any] | None) -> str | None:
    value = _pick(
        row,
        [
            "報告年季",
            "報告年/季",
            "資料年月",
            "年月",
            "出表日期",
        ],
    )
    return str(value).strip() if value not in {None, ""} else None


def _normalise_income(row: dict[str, Any] | None) -> dict[str, Any]:
    revenue = _parse_number(_pick(row, ["營業收入", "收入合計", "營業收入合計"]))
    gross_profit = _parse_number(_pick(row, ["營業毛利毛損", "營業毛利（毛損）", "營業毛利"]))
    operating_income = _parse_number(
        _pick(row, ["營業利益損失", "營業利益（損失）", "營業利益"])
    )
    net_income = _parse_number(
        _pick(
            row,
            [
                "本期淨利淨損",
                "本期淨利（淨損）",
                "本期淨利",
                "歸屬於母公司業主之淨利損",
                "歸屬於母公司業主之淨利（損）",
            ],
        )
    )
    eps = _parse_number(
        _pick(row, ["基本每股盈餘元", "基本每股盈餘（元）", "基本每股盈餘", "每股盈餘"])
    )
    return {
        "period": _period_from_row(row),
        "revenue": revenue,
        "gross_profit": gross_profit,
        "operating_income": operating_income,
        "net_income": net_income,
        "eps": eps,
        "gross_margin_pct": _safe_ratio(gross_profit, revenue),
        "operating_margin_pct": _safe_ratio(operating_income, revenue),
        "net_margin_pct": _safe_ratio(net_income, revenue),
    }


def _normalise_balance(row: dict[str, Any] | None) -> dict[str, Any]:
    current_assets = _parse_number(_pick(row, ["流動資產", "流動資產合計"]))
    total_assets = _parse_number(_pick(row, ["資產總額", "資產合計"]))
    current_liabilities = _parse_number(_pick(row, ["流動負債", "流動負債合計"]))
    total_liabilities = _parse_number(_pick(row, ["負債總額", "負債合計"]))
    equity = _parse_number(_pick(row, ["權益總額", "權益合計"]))
    return {
        "period": _period_from_row(row),
        "current_assets": current_assets,
        "total_assets": total_assets,
        "current_liabilities": current_liabilities,
        "total_liabilities": total_liabilities,
        "equity": equity,
        "debt_ratio_pct": _safe_ratio(total_liabilities, total_assets),
        "current_ratio_pct": _safe_ratio(current_assets, current_liabilities),
    }


def _normalise_monthly_revenue(row: dict[str, Any] | None) -> dict[str, Any]:
    current = _parse_number(
        _pick(row, ["營業收入當月營收", "營業收入-當月營收", "當月營收"])
    )
    previous_year = _parse_number(
        _pick(row, ["營業收入去年當月營收", "營業收入-去年當月營收", "去年當月營收"])
    )
    yoy = _parse_number(
        _pick(
            row,
            [
                "營業收入去年同月增減%",
                "營業收入-去年同月增減(%)",
                "去年同月增減百分比",
            ],
        )
    )
    if yoy is None and current is not None and previous_year not in {None, 0}:
        yoy = round((current - previous_year) / previous_year * 100, 2)
    return {
        "period": _period_from_row(row),
        "current_month_revenue": current,
        "previous_year_month_revenue": previous_year,
        "yoy_pct": yoy,
    }


async def get_company_snapshot(code: str) -> dict[str, Any]:
    if code not in SEMICONDUCTOR_PEERS:
        raise FinancialDataUnavailable("Company is outside the wafer-foundry MVP peer group")

    income_rows, balance_rows, revenue_rows = await asyncio.gather(
        _fetch_dataset(INCOME_ENDPOINT),
        _fetch_dataset(BALANCE_ENDPOINT),
        _fetch_dataset(MONTHLY_REVENUE_ENDPOINT),
    )
    income_row = _find_company_row(income_rows, code)
    balance_row = _find_company_row(balance_rows, code)
    monthly_row = _find_company_row(revenue_rows, code)
    if not any([income_row, balance_row, monthly_row]):
        raise FinancialDataUnavailable(f"No official TWSE row found for company {code}")

    profile = SEMICONDUCTOR_PEERS[code]
    return {
        "company_code": code,
        "company_name": profile["name"],
        "english_name": profile["english_name"],
        "subindustry": profile["subindustry"],
        "income_statement": _normalise_income(income_row),
        "balance_sheet": _normalise_balance(balance_row),
        "monthly_revenue": _normalise_monthly_revenue(monthly_row),
        "data_coverage": "latest_twse_snapshot",
        "data_quality": "official_live",
        "sources": [
            {
                "name": "TWSE 上市公司綜合損益表（一般業）",
                "url": f"{TWSE_BASE_URL}{INCOME_ENDPOINT}",
            },
            {
                "name": "TWSE 上市公司資產負債表（一般業）",
                "url": f"{TWSE_BASE_URL}{BALANCE_ENDPOINT}",
            },
            {
                "name": "TWSE 上市公司每月營業收入彙總表",
                "url": f"{TWSE_BASE_URL}{MONTHLY_REVENUE_ENDPOINT}",
            },
        ],
    }


async def get_peer_snapshots() -> list[dict[str, Any]]:
    results = await asyncio.gather(
        *(get_company_snapshot(code) for code in SEMICONDUCTOR_PEERS),
        return_exceptions=True,
    )
    output: list[dict[str, Any]] = []
    for code, result in zip(SEMICONDUCTOR_PEERS, results):
        if isinstance(result, Exception):
            output.append(
                {
                    "company_code": code,
                    "company_name": SEMICONDUCTOR_PEERS[code]["name"],
                    "subindustry": SEMICONDUCTOR_PEERS[code]["subindustry"],
                    "data_quality": "unavailable",
                    "error": str(result),
                }
            )
        else:
            output.append(result)
    return output


def extract_claim(text: str, company_code: str | None = None) -> ExtractedClaim:
    original = text.strip()
    lowered = original.lower()

    detected_code = company_code if company_code in SEMICONDUCTOR_PEERS else None
    if not detected_code:
        for code, profile in SEMICONDUCTOR_PEERS.items():
            if any(alias.lower() in lowered for alias in profile["aliases"]):
                detected_code = code
                break

    metric_rules: list[tuple[str, list[str]]] = [
        ("monthly_revenue_yoy_pct", ["月營收年增", "營收年增", "營收成長", "營收增加", "營收暴增", "營收衰退"]),
        ("gross_margin_pct", ["毛利率"]),
        ("operating_margin_pct", ["營業利益率", "營益率"]),
        ("net_margin_pct", ["淨利率", "稅後純益率"]),
        ("debt_ratio_pct", ["負債比", "負債比率", "負債佔資產比率"]),
        ("current_ratio_pct", ["流動比率"]),
        ("eps", ["每股盈餘", "EPS", "eps"]),
        ("net_income", ["稅後淨利", "稅後純益", "淨利", "由虧轉盈"]),
        ("revenue", ["營業收入", "營收"]),
    ]
    metric = next(
        (name for name, terms in metric_rules if any(term.lower() in lowered for term in terms)),
        None,
    )

    percent_match = re.search(r"(-?\d+(?:\.\d+)?)\s*(?:%|％|百分比|個百分點)", original)
    money_match = re.search(r"(-?\d+(?:\.\d+)?)\s*(兆|億|萬|元)", original)
    eps_match = re.search(r"(?:EPS|每股盈餘)\s*(?:為|達|約|成長至|降至)?\s*(-?\d+(?:\.\d+)?)", original, re.I)

    claimed_value: float | None = None
    unit: str | None = None
    if percent_match:
        claimed_value = float(percent_match.group(1))
        unit = "pct"
    elif metric == "eps" and eps_match:
        claimed_value = float(eps_match.group(1))
        unit = "twd_per_share"
    elif money_match:
        claimed_value = float(money_match.group(1))
        unit = money_match.group(2)

    direction = None
    if any(term in original for term in ["增加", "成長", "上升", "提高", "暴增", "創高", "由虧轉盈"]):
        direction = "increase"
    elif any(term in original for term in ["減少", "下降", "衰退", "下滑", "惡化", "轉虧"]):
        direction = "decrease"

    comparison = None
    if any(term in original for term in ["年增", "去年同期", "去年同月", "YoY", "YOY"]):
        comparison = "year_over_year"
    elif any(term in original for term in ["季增", "上季", "QoQ", "QOQ"]):
        comparison = "quarter_over_quarter"

    company_name = SEMICONDUCTOR_PEERS[detected_code]["name"] if detected_code else None
    return ExtractedClaim(
        company_code=detected_code,
        company_name=company_name,
        metric=metric,
        claimed_value=claimed_value,
        unit=unit,
        comparison=comparison,
        direction=direction,
        original_text=original,
    )


def _metric_actual(snapshot: dict[str, Any], metric: str | None) -> tuple[float | None, str | None, str | None]:
    income = snapshot["income_statement"]
    balance = snapshot["balance_sheet"]
    monthly = snapshot["monthly_revenue"]
    mapping: dict[str, tuple[float | None, str | None, str | None]] = {
        "monthly_revenue_yoy_pct": (monthly.get("yoy_pct"), "pct", monthly.get("period")),
        "gross_margin_pct": (income.get("gross_margin_pct"), "pct", income.get("period")),
        "operating_margin_pct": (income.get("operating_margin_pct"), "pct", income.get("period")),
        "net_margin_pct": (income.get("net_margin_pct"), "pct", income.get("period")),
        "debt_ratio_pct": (balance.get("debt_ratio_pct"), "pct", balance.get("period")),
        "current_ratio_pct": (balance.get("current_ratio_pct"), "pct", balance.get("period")),
        "eps": (income.get("eps"), "twd_per_share", income.get("period")),
        "net_income": (income.get("net_income"), "reported_amount", income.get("period")),
        "revenue": (income.get("revenue"), "reported_amount", income.get("period")),
    }
    return mapping.get(metric, (None, None, None))


def _verdict_from_values(
    claimed: float,
    actual: float,
    unit: str | None,
) -> tuple[str, float, str]:
    difference = round(actual - claimed, 2)
    if unit == "pct":
        absolute_gap = abs(difference)
        if absolute_gap <= 2:
            return "supported", difference, "主張與官方數值差距在 2 個百分點內。"
        if absolute_gap <= 8:
            return "partially_supported", difference, "方向大致相符，但幅度與官方數值存在差距。"
        return "contradicted", difference, "主張幅度與官方數值存在明顯差距。"

    denominator = max(abs(actual), 1.0)
    relative_gap = abs(actual - claimed) / denominator
    if relative_gap <= 0.05:
        return "supported", difference, "主張與官方數值的相對差距在 5% 內。"
    if relative_gap <= 0.15:
        return "partially_supported", difference, "主張接近官方數值，但仍有可辨識差距。"
    return "contradicted", difference, "主張與官方數值不一致。"


async def verify_claim(text: str, company_code: str | None = None) -> dict[str, Any]:
    claim = extract_claim(text, company_code)
    if not claim.company_code:
        return {
            "claim": claim.__dict__,
            "verdict": "insufficient_evidence",
            "risk_level": "medium",
            "explanation": "目前僅支援台積電、聯電與力積電，且未能從文字辨識公司。",
            "data_quality": "not_checked",
        }
    if not claim.metric:
        return {
            "claim": claim.__dict__,
            "verdict": "not_applicable",
            "risk_level": "low",
            "explanation": "文字中未辨識到可由財報直接驗證的財務指標。",
            "data_quality": "not_checked",
        }

    snapshot = await get_company_snapshot(claim.company_code)
    actual, actual_unit, evidence_period = _metric_actual(snapshot, claim.metric)
    if actual is None:
        return {
            "claim": claim.__dict__,
            "verdict": "insufficient_evidence",
            "risk_level": "medium",
            "explanation": "官方最新快照中沒有足夠欄位可驗證這項主張。此結果不代表主張為假。",
            "evidence": {
                "period": evidence_period,
                "actual_value": None,
                "unit": actual_unit,
            },
            "snapshot": snapshot,
            "data_quality": snapshot["data_quality"],
        }

    if claim.claimed_value is None:
        direction_matches = None
        if claim.direction == "increase" and claim.metric == "monthly_revenue_yoy_pct":
            direction_matches = actual > 0
        elif claim.direction == "decrease" and claim.metric == "monthly_revenue_yoy_pct":
            direction_matches = actual < 0

        if direction_matches is True:
            verdict = "supported"
            risk_level = "low"
            explanation = "主張的增減方向與官方最新月營收年增率一致，但文字未提供可核對的明確數值。"
        elif direction_matches is False:
            verdict = "contradicted"
            risk_level = "high"
            explanation = "主張的增減方向與官方最新月營收年增率相反。"
        else:
            verdict = "insufficient_evidence"
            risk_level = "medium"
            explanation = "已找到對應官方數值，但主張未提供明確數字或可直接核對的比較基準。"

        return {
            "claim": claim.__dict__,
            "verdict": verdict,
            "risk_level": risk_level,
            "explanation": explanation,
            "evidence": {
                "period": evidence_period,
                "actual_value": actual,
                "unit": actual_unit,
                "calculation": "由 TWSE 官方資料欄位取得或依官方欄位重新計算",
            },
            "snapshot": snapshot,
            "data_quality": snapshot["data_quality"],
        }

    verdict, difference, reason = _verdict_from_values(claim.claimed_value, actual, claim.unit or actual_unit)
    risk_level = {
        "supported": "low",
        "partially_supported": "medium",
        "contradicted": "high",
    }[verdict]
    return {
        "claim": claim.__dict__,
        "verdict": verdict,
        "risk_level": risk_level,
        "explanation": reason,
        "evidence": {
            "period": evidence_period,
            "claimed_value": claim.claimed_value,
            "actual_value": actual,
            "difference": difference,
            "unit": claim.unit or actual_unit,
            "calculation": "數值由程式以 TWSE 官方欄位取得或重新計算，未交由生成式模型猜測。",
        },
        "snapshot": snapshot,
        "data_quality": snapshot["data_quality"],
    }
