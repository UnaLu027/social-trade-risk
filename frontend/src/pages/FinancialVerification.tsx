import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  BarChart3,
  Calculator,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSearch,
  Loader2,
  ShieldQuestion,
  XCircle,
} from 'lucide-react'

import { TopBar } from '../components/layout/TopBar'
import {
  getFinancialCompanies,
  getFinancialPeers,
  verifyFinancialClaim,
  type FinancialSnapshot,
  type FinancialVerdict,
  type VerificationResult,
} from '../api/financialApi'

const SAMPLE_CLAIMS = [
  '台積電最新月營收年增 50%',
  '聯電最新毛利率為 35%',
  '力積電目前負債比超過 60%',
]

const VERDICT_META: Record<FinancialVerdict, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  supported: { label: '財報支持', icon: CheckCircle2, color: '#34d399', bg: '#052e16' },
  partially_supported: { label: '部分支持／幅度有落差', icon: AlertTriangle, color: '#fbbf24', bg: '#451a03' },
  contradicted: { label: '與財報不符', icon: XCircle, color: '#fb7185', bg: '#4c0519' },
  insufficient_evidence: { label: '財報證據不足', icon: ShieldQuestion, color: '#fbbf24', bg: '#451a03' },
  not_applicable: { label: '不適用財報查證', icon: ShieldQuestion, color: '#94a3b8', bg: '#1e293b' },
}

const METRIC_LABELS: Record<string, string> = {
  monthly_revenue_yoy_pct: '最新月營收年增率',
  gross_margin_pct: '毛利率',
  operating_margin_pct: '營業利益率',
  net_margin_pct: '淨利率',
  debt_ratio_pct: '負債比率',
  current_ratio_pct: '流動比率',
  eps: '每股盈餘',
  net_income: '稅後淨利',
  revenue: '營業收入',
}

function formatValue(value: number | null | undefined, unit?: string | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  if (unit === 'pct') return `${value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })}%`
  if (unit === 'twd_per_share') return `${value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })} 元`
  return value.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
}

function SnapshotCard({ snapshot }: { snapshot: FinancialSnapshot }) {
  const items = [
    ['月營收年增', snapshot.monthly_revenue.yoy_pct, 'pct'],
    ['毛利率', snapshot.income_statement.gross_margin_pct, 'pct'],
    ['營業利益率', snapshot.income_statement.operating_margin_pct, 'pct'],
    ['淨利率', snapshot.income_statement.net_margin_pct, 'pct'],
    ['負債比', snapshot.balance_sheet.debt_ratio_pct, 'pct'],
    ['流動比率', snapshot.balance_sheet.current_ratio_pct, 'pct'],
    ['EPS', snapshot.income_statement.eps, 'twd_per_share'],
  ] as const

  return (
    <div className="rounded-xl p-4" style={{ background: '#151827', border: '1px solid #262b40' }}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="text-sm font-semibold text-white">{snapshot.company_name}</div>
          <div className="text-xs mt-1" style={{ color: '#64748b' }}>
            {snapshot.company_code} · {snapshot.subindustry}
          </div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded" style={{ color: '#34d399', background: '#052e16' }}>
          官方即時資料
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(([label, value, unit]) => (
          <div key={label} className="rounded-lg px-3 py-2" style={{ background: '#0f111b' }}>
            <div className="text-[10px]" style={{ color: '#64748b' }}>{label}</div>
            <div className="text-sm font-semibold text-white mt-1">{formatValue(value, unit)}</div>
          </div>
        ))}
      </div>
      <div className="text-[10px] mt-3" style={{ color: '#475569' }}>
        損益期間：{snapshot.income_statement.period ?? '未提供'}　月營收期間：{snapshot.monthly_revenue.period ?? '未提供'}
      </div>
    </div>
  )
}

function ResultPanel({ result }: { result: VerificationResult }) {
  const meta = VERDICT_META[result.verdict]
  const Icon = meta.icon
  const snapshot = result.snapshot

  return (
    <div className="space-y-4">
      <section className="rounded-xl p-5" style={{ background: '#151827', border: `1px solid ${meta.color}55` }}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: meta.bg }}>
              <Icon size={20} color={meta.color} />
            </div>
            <div>
              <div className="text-xs mb-1" style={{ color: '#64748b' }}>財報證據驗證結果</div>
              <div className="text-lg font-semibold" style={{ color: meta.color }}>{meta.label}</div>
              <p className="text-sm mt-2 leading-6" style={{ color: '#cbd5e1' }}>{result.explanation}</p>
            </div>
          </div>
          <span
            className="text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
            style={{
              color: result.risk_level === 'high' ? '#fb7185' : result.risk_level === 'medium' ? '#fbbf24' : '#34d399',
              background: result.risk_level === 'high' ? '#4c0519' : result.risk_level === 'medium' ? '#451a03' : '#052e16',
            }}
          >
            可信度風險：{result.risk_level === 'high' ? '高' : result.risk_level === 'medium' ? '中' : '低'}
          </span>
        </div>
      </section>

      <section className="rounded-xl p-5" style={{ background: '#151827', border: '1px solid #262b40' }}>
        <div className="flex items-center gap-2 mb-4">
          <FileSearch size={16} color="#38bdf8" />
          <h2 className="text-sm font-semibold text-white">抽取到的財務主張</h2>
        </div>
        <div className="grid md:grid-cols-4 gap-3">
          <InfoCell label="公司" value={result.claim.company_name ? `${result.claim.company_name} ${result.claim.company_code}` : '未辨識'} />
          <InfoCell label="指標" value={result.claim.metric ? METRIC_LABELS[result.claim.metric] ?? result.claim.metric : '未辨識'} />
          <InfoCell label="主張數值" value={formatValue(result.claim.claimed_value, result.claim.unit)} />
          <InfoCell label="比較方式" value={result.claim.comparison === 'year_over_year' ? '年增／去年同期' : result.claim.comparison === 'quarter_over_quarter' ? '季增／上季' : '未指定'} />
        </div>
      </section>

      {result.evidence && (
        <section className="rounded-xl p-5" style={{ background: '#151827', border: '1px solid #262b40' }}>
          <div className="flex items-center gap-2 mb-4">
            <Calculator size={16} color="#a78bfa" />
            <h2 className="text-sm font-semibold text-white">官方證據與程式計算</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-3">
            <InfoCell label="官方期間" value={result.evidence.period ?? '未提供'} />
            <InfoCell label="新聞／貼文主張" value={formatValue(result.evidence.claimed_value, result.evidence.unit)} />
            <InfoCell label="官方實際數值" value={formatValue(result.evidence.actual_value, result.evidence.unit)} />
            <InfoCell label="差異" value={formatValue(result.evidence.difference, result.evidence.unit)} />
          </div>
          {result.evidence.calculation && (
            <p className="text-xs mt-4 leading-5" style={{ color: '#94a3b8' }}>{result.evidence.calculation}</p>
          )}
        </section>
      )}

      {snapshot && (
        <section className="rounded-xl p-5" style={{ background: '#151827', border: '1px solid #262b40' }}>
          <div className="flex items-center gap-2 mb-4">
            <Database size={16} color="#34d399" />
            <h2 className="text-sm font-semibold text-white">官方資料來源</h2>
          </div>
          <div className="space-y-2">
            {snapshot.sources.map(source => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-xs hover:opacity-80"
                style={{ background: '#0f111b', color: '#94a3b8' }}
              >
                <span>{source.name}</span>
                <ExternalLink size={12} />
              </a>
            ))}
          </div>
          <p className="text-[11px] mt-4 leading-5" style={{ color: '#64748b' }}>{result.disclaimer}</p>
        </section>
      )}
    </div>
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-3" style={{ background: '#0f111b' }}>
      <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>{label}</div>
      <div className="text-sm font-medium text-white break-words">{value}</div>
    </div>
  )
}

export function FinancialVerification() {
  const [text, setText] = useState(SAMPLE_CLAIMS[0])
  const [companyCode, setCompanyCode] = useState('2330')

  const companiesQuery = useQuery({
    queryKey: ['financial-companies'],
    queryFn: getFinancialCompanies,
    staleTime: 60 * 60 * 1000,
  })

  const peersQuery = useQuery({
    queryKey: ['financial-peers'],
    queryFn: getFinancialPeers,
    staleTime: 15 * 60 * 1000,
    retry: 1,
  })

  const verifyMutation = useMutation({
    mutationFn: verifyFinancialClaim,
  })

  const availablePeers = useMemo(
    () => (peersQuery.data ?? []).filter(item => item.data_quality !== 'unavailable'),
    [peersQuery.data],
  )

  function submit() {
    const value = text.trim()
    if (!value) return
    verifyMutation.mutate({ text: value, company_code: companyCode || undefined })
  }

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar title="半導體財報證據驗證" />
      <div className="p-6 space-y-6 overflow-y-auto">
        <section className="rounded-2xl p-6" style={{ background: 'linear-gradient(135deg, #111827, #0f172a)', border: '1px solid #26334d' }}>
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-xs font-semibold mb-3" style={{ color: '#38bdf8' }}>
                <BarChart3 size={15} />
                晶圓代工子產業 MVP
              </div>
              <h1 className="text-2xl font-semibold text-white">用官方財報驗證新聞與社群中的財務主張</h1>
              <p className="text-sm leading-7 mt-3" style={{ color: '#94a3b8' }}>
                系統從文字抽取公司、財務指標與宣稱數值，再以 TWSE 官方最新財務快照重新計算。
                AI 負責理解文字，數值判斷由可重現的程式規則完成。
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 min-w-[260px]">
              <InfoCell label="目前範圍" value="台積電／聯電／力積電" />
              <InfoCell label="官方來源" value="TWSE OpenAPI" />
              <InfoCell label="資料口徑" value="上市一般業最新快照" />
              <InfoCell label="歷史資料" value="XBRL 建置中" />
            </div>
          </div>
        </section>

        <section className="rounded-xl p-5" style={{ background: '#151827', border: '1px solid #262b40' }}>
          <div className="flex items-center gap-2 mb-4">
            <FileSearch size={16} color="#38bdf8" />
            <h2 className="text-sm font-semibold text-white">輸入待查證資訊</h2>
          </div>

          <div className="grid lg:grid-cols-[180px_1fr] gap-4">
            <div>
              <label className="text-xs block mb-2" style={{ color: '#94a3b8' }}>指定公司</label>
              <select
                value={companyCode}
                onChange={event => setCompanyCode(event.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ background: '#0f111b', border: '1px solid #2d3148', color: '#f8fafc' }}
              >
                {(companiesQuery.data ?? [
                  { company_code: '2330', company_name: '台積電', english_name: 'TSMC', subindustry: '晶圓代工' },
                  { company_code: '2303', company_name: '聯電', english_name: 'UMC', subindustry: '晶圓代工' },
                  { company_code: '6770', company_name: '力積電', english_name: 'PSMC', subindustry: '晶圓代工' },
                ]).map(company => (
                  <option key={company.company_code} value={company.company_code}>
                    {company.company_code} {company.company_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs block mb-2" style={{ color: '#94a3b8' }}>新聞標題、內文或 X 貼文</label>
              <textarea
                value={text}
                onChange={event => setText(event.target.value)}
                rows={5}
                maxLength={5000}
                placeholder="例如：台積電最新月營收年增 50%"
                className="w-full rounded-lg px-4 py-3 text-sm leading-6 resize-y outline-none"
                style={{ background: '#0f111b', border: '1px solid #2d3148', color: '#f8fafc' }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <div className="flex flex-wrap gap-2">
              {SAMPLE_CLAIMS.map(sample => (
                <button
                  key={sample}
                  onClick={() => {
                    setText(sample)
                    if (sample.includes('聯電')) setCompanyCode('2303')
                    else if (sample.includes('力積電')) setCompanyCode('6770')
                    else setCompanyCode('2330')
                  }}
                  className="text-[11px] px-3 py-1.5 rounded-full hover:opacity-80"
                  style={{ color: '#94a3b8', background: '#1e2235', border: '1px solid #2d3148' }}
                >
                  {sample}
                </button>
              ))}
            </div>
            <button
              onClick={submit}
              disabled={!text.trim() || verifyMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ color: '#052e16', background: '#34d399' }}
            >
              {verifyMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <FileSearch size={15} />}
              開始財報查證
            </button>
          </div>
        </section>

        {verifyMutation.isError && (
          <section className="rounded-xl p-4 flex items-start gap-3" style={{ background: '#450a0a', border: '1px solid #7f1d1d' }}>
            <AlertTriangle size={18} color="#fca5a5" />
            <div>
              <div className="text-sm font-semibold" style={{ color: '#fecaca' }}>目前無法取得官方財務資料</div>
              <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>
                請稍後重試，或確認 Railway 後端已部署本功能分支。系統不會以虛構數字取代官方資料。
              </p>
            </div>
          </section>
        )}

        {verifyMutation.data && <ResultPanel result={verifyMutation.data} />}

        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">晶圓代工同群最新快照</h2>
              <p className="text-xs mt-1" style={{ color: '#64748b' }}>用於同產業背景理解，不構成公司排名或投資評等。</p>
            </div>
            {peersQuery.isFetching && <Loader2 size={15} className="animate-spin" color="#64748b" />}
          </div>
          <div className="grid xl:grid-cols-3 gap-4">
            {availablePeers.map(snapshot => <SnapshotCard key={snapshot.company_code} snapshot={snapshot} />)}
          </div>
          {!peersQuery.isLoading && availablePeers.length === 0 && (
            <div className="rounded-xl p-5 text-sm" style={{ color: '#94a3b8', background: '#151827', border: '1px solid #262b40' }}>
              尚未取得官方同群資料。部署後端後重新整理即可測試 TWSE 串接。
            </div>
          )}
        </section>

        <section className="rounded-xl p-4 flex items-start gap-3" style={{ background: '#172033', border: '1px solid #26334d' }}>
          <Database size={17} color="#60a5fa" className="mt-0.5" />
          <div>
            <div className="text-xs font-semibold" style={{ color: '#bfdbfe' }}>目前資料涵蓋限制</div>
            <p className="text-xs leading-5 mt-1" style={{ color: '#94a3b8' }}>
              第一階段直接串接 TWSE 最新快照；近三年至五年季度資料仍需建立 MOPS XBRL 批次匯入與版本資料庫。
              系統會清楚標示查證期間，不會用最新一期資料冒充歷史查證。
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
