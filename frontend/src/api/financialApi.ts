import axios from 'axios'
import { BASE_URL } from './client'

// The existing AI endpoints are deployed separately from the full FastAPI app.
// Keep the financial-evidence backend configurable so enabling a Railway public
// domain never redirects or breaks the existing post-analysis API.
export const FINANCIAL_BASE_URL: string =
  import.meta.env.VITE_FINANCIAL_API_BASE_URL?.trim() || BASE_URL

const financialApi = axios.create({
  baseURL: FINANCIAL_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

export type FinancialVerdict =
  | 'supported'
  | 'partially_supported'
  | 'contradicted'
  | 'insufficient_evidence'
  | 'not_applicable'

export interface CompanyOption {
  company_code: string
  company_name: string
  english_name: string
  subindustry: string
}

export interface FinancialClaim {
  company_code: string | null
  company_name: string | null
  metric: string | null
  claimed_value: number | null
  unit: string | null
  comparison: string | null
  direction: string | null
  original_text: string
}

export interface FinancialSnapshot {
  company_code: string
  company_name: string
  english_name: string
  subindustry: string
  income_statement: {
    period: string | null
    revenue: number | null
    gross_profit: number | null
    operating_income: number | null
    net_income: number | null
    eps: number | null
    gross_margin_pct: number | null
    operating_margin_pct: number | null
    net_margin_pct: number | null
  }
  balance_sheet: {
    period: string | null
    current_assets: number | null
    total_assets: number | null
    current_liabilities: number | null
    total_liabilities: number | null
    equity: number | null
    debt_ratio_pct: number | null
    current_ratio_pct: number | null
  }
  monthly_revenue: {
    period: string | null
    current_month_revenue: number | null
    previous_year_month_revenue: number | null
    yoy_pct: number | null
  }
  data_coverage: string
  data_quality: string
  sources: { name: string; url: string }[]
}

export interface VerificationResult {
  claim: FinancialClaim
  verdict: FinancialVerdict
  risk_level: 'low' | 'medium' | 'high'
  explanation: string
  evidence?: {
    period: string | null
    claimed_value?: number | null
    actual_value: number | null
    difference?: number | null
    unit: string | null
    calculation?: string
  }
  snapshot?: FinancialSnapshot
  data_quality: string
  disclaimer: string
}

export async function getFinancialCompanies(): Promise<CompanyOption[]> {
  const { data } = await financialApi.get('/api/v1/financial/companies')
  return data.companies
}

export async function getFinancialPeers(): Promise<FinancialSnapshot[]> {
  const { data } = await financialApi.get('/api/v1/financial/peers')
  return data.companies
}

export async function verifyFinancialClaim(payload: {
  text: string
  company_code?: string
}): Promise<VerificationResult> {
  const { data } = await financialApi.post('/api/v1/financial/verify-claim', payload)
  return data
}
