import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Calendar, TrendingUp, AlertTriangle, FileText, Newspaper, ExternalLink,
  ShieldAlert, Info, Copy, Printer, Globe, Clock,
} from 'lucide-react'
import { phpGet, phpApi } from '../api/phpClient'
import { api } from '../api/client'
import { TopBar } from '../components/layout/TopBar'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  computeInvestorCaution,
  RISK_LABEL_ZH,
  type SignalLevel,
  type DataCoverageLevel,
  type InterpretationStatus,
} from '../lib/investorCaution'
import {
  copySummary, downloadWord, printReport, downloadHtml,
  type BriefExportInput,
} from '../lib/investorBriefExport'
import {
  getFreshnessStatus, formatFreshnessTime,
  FRESHNESS_LABEL, FRESHNESS_COLOR,
} from '../lib/monitoringFreshness'
import { fetchMonitoringData } from '../api/monitoringDataClient'

// ── types ────────────────────────────────────────────────────────────────────

interface ScheduledNewsItem {
  id: string
  headline: string | null
  url: string | null
  published_at: string
  source: string
  ai_risk_label: string | null
  ai_risk_score: number | null
}

interface ScheduledSummary {
  signal_level: string
  combined_score: number
  external_news_score: number
  latest_snapshot_score: number
  market_history_score: number
  data_coverage: string
  interpretation_status: string
  coverage_note: string
  source_count: number
  generated_at: string
}

interface AbnormalReturn {
  benchmark_symbol: string
  stock_return_1d: number | null
  benchmark_return_1d: number | null
  abnormal_return_1d: number | null
  stock_return_5d: number | null
  benchmark_return_5d: number | null
  abnormal_return_5d: number | null
  interpretation: 'outperforming' | 'underperforming' | 'neutral' | 'insufficient_data'
  data_quality: 'computed_from_market_history' | 'insufficient_benchmark_data' | 'insufficient_stock_data'
}

interface MarketModelEntry {
  symbol: string
  benchmark_symbol: string
  method: string
  estimation_days: number
  event_window_days: number
  estimation_start: string
  estimation_end: string
  alpha: number
  beta: number
  train_r2: number
  residual_std: number
  stock_return_1d: number
  benchmark_return_1d: number
  expected_return_1d: number
  abnormal_return_1d: number
  avg_abnormal_return_5d: number
  CAR_5d: number
  abnormal_return_zscore: number
  CAR_5d_zscore: number
  interpretation: 'outperforming' | 'underperforming' | 'neutral' | 'insufficient_data'
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  data_quality: string
}

interface MarketModelJson {
  success: boolean
  generated_at: string
  method: string
  benchmark_symbol: string
  symbols: Record<string, MarketModelEntry>
}

interface ScheduledLatest {
  fetched_at: string
  refresh_status: string
  fetch_errors: string[]
  summary: ScheduledSummary | null
  items: ScheduledNewsItem[]
  news_count: number
  abnormal_return?: AbnormalReturn
}

interface SymbolMonitorData {
  latest:              ScheduledLatest | null    // last known-good; null only before first successful run
  last_attempt_at:     string                    // when this refresh run happened
  last_attempt_status: string                    // 'success'|'partial'|'error'
  last_attempt_errors: string[]
  history:             unknown[]
}

interface MonitoringJsonData {
  generated_at: string
  refresh_status: string
  symbols: Record<string, SymbolMonitorData>
}

interface Snapshot {
  snapshot_date: string
  price: number | null
  social_hype_score: number | null
  manipulation_signal_score: number | null
  fomo_score: number | null
  short_squeeze_pressure: number | null
  ai_risk_label: string | null
  data_quality?: string | null
}

interface EventRow {
  event_date: string
  event_type: string
  title: string
  description: string
  risk_impact: string
}

interface SocialSignalItem {
  id: string
  source: string
  published_at: string
  headline: string | null
  summary: string | null
  url: string | null
  ai_risk_label: string | null
  ai_risk_score: number | null
  ai_highlighted_terms: string[] | null
}

interface MarketHistoryItem {
  date: string
  close: number
  market_heat_score: number
  volatility_anomaly_score: number
  fomo_score: number
  short_squeeze_pressure: number
  market_risk_label: string
}

// ── GME narrative (static) ────────────────────────────────────────────────────

const GME_NARRATIVE = `
2021 年 1 月，GameStop（GME）成為史上最著名的 meme-stock 軋空事件。
r/WallStreetBets 的散戶投資者發現 GME 空頭持倉超過 100% 流通股，決定集體買入，
形成逼空壓力。著名投資者 Ryan Cohen 加入董事會進一步提振信心。

1 月 27 日，GME 股價衝上 $347，造成以 Melvin Capital 為首的對沖基金數十億美元虧損。
1 月 28 日，Robinhood 等券商限制 GME 買盤，引發大規模民意反彈並觸發監管調查。

這一事件揭示了社群媒體如何催生協同性投資行為、操縱風險與散戶風險傳染，
是社群交易風險研究的最重要案例之一。
`

// ── helpers ──────────────────────────────────────────────────────────────────

const RISK_COLOR = { Critical: '#ef4444', High: '#f97316', Medium: '#f59e0b', Low: '#10b981' }

function riskColor(label: string | null) {
  return RISK_COLOR[label as keyof typeof RISK_COLOR] ?? '#64748b'
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  social_surge:      '社群激增',
  price_spike:       '股價飆漲',
  short_squeeze:     '軋空事件',
  influencer_signal: '意見領袖信號',
  restriction:       '交易限制',
  correction:        '價格修正',
  info:              '資訊',
  meme_attention:    'Meme 關注',
  volume_spike:      '成交量異常',
  normal_news:       '一般新聞',
}

function formatUtc(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').slice(0, 16)
}

const SIGNAL_LEVEL_LABEL: Record<SignalLevel, string> = {
  low:               '低警戒',
  medium:            '中警戒',
  high:              '高警戒',
  extreme:           '極高警戒',
  insufficient_data: '資料不足',
}

const SIGNAL_LEVEL_COLOR: Record<SignalLevel, string> = {
  low:               '#10b981',
  medium:            '#f59e0b',
  high:              '#f97316',
  extreme:           '#ef4444',
  insufficient_data: '#64748b',
}

const COVERAGE_LABEL: Record<DataCoverageLevel, string> = {
  FULL:    '完整（3 / 3）',
  PARTIAL: '部分可用',
  MINIMAL: '僅一類可用',
  NONE:    '無資料',
}

const INTERPRETATION_LABEL: Record<InterpretationStatus, string> = {
  comprehensive:     '綜合觀察',
  preliminary:       '初步觀察',
  insufficient_data: '資料不足',
}

// ── ScoreBar ──────────────────────────────────────────────────────────────────

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 75 ? '#ef4444' : score >= 55 ? '#f97316' : score >= 35 ? '#f59e0b' : '#10b981'
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[11px]" style={{ color: '#94a3b8' }}>{label}</span>
        <span className="text-[11px] font-mono font-semibold" style={{ color }}>{score}</span>
      </div>
      <div className="rounded-full h-1.5" style={{ background: '#2d3148' }}>
        <div
          className="rounded-full h-1.5 transition-all"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export function RiskReport() {
  const { symbol = 'GME' } = useParams<{ symbol: string }>()
  const upper = symbol.toUpperCase()
  const [copyDone, setCopyDone] = useState(false)

  const { data: snapData, isLoading: snapLoading } = useQuery({
    queryKey: ['php-snapshots', upper],
    queryFn: () => phpGet<{ symbol: string; snapshots: Snapshot[] }>(`/risk_snapshots.php?symbol=${upper}&limit=30`),
    retry: 1,
  })

  const { data: evtData, isLoading: evtLoading } = useQuery({
    queryKey: ['php-events', upper],
    queryFn: () => phpGet<{ events: EventRow[] }>(`/events.php?symbol=${upper}`),
    retry: 1,
  })

  const { data: fastapiData, isLoading: fastapiLoading, isError: fastapiSnapshotError } = useQuery({
    queryKey: ['fastapi-market-snapshot', upper],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean
        count: number
        fetched_at: string
        data: { count: number; snapshots: Snapshot[] }
        errors: { symbol: string; error: string }[]
      }>(`/api/v1/market-snapshots?symbols=${upper}`)
      return res.data
    },
    retry: 1,
    staleTime: 5 * 60_000,
  })

  const { data: signalsData, isLoading: signalsLoading, isError: signalsError } = useQuery({
    queryKey: ['fastapi-social-signals', upper],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean
        items: SocialSignalItem[]
        data_quality: string
        errors: { source: string; error: string }[]
      }>(`/api/v1/social-signals?symbol=${upper}&sources=finnhub&limit=5`)
      return res.data
    },
    retry: 1,
    staleTime: 7 * 60_000,
  })

  const { data: histData, isLoading: histLoading, isError: histError } = useQuery({
    queryKey: ['fastapi-market-history', upper],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean
        symbol: string
        period: string
        data_quality: string
        items: MarketHistoryItem[]
        errors: { symbol: string; error: string }[]
      }>(`/api/v1/market-history?symbol=${upper}&period=1mo`)
      return res.data
    },
    retry: 1,
    staleTime: 30 * 60_000,
  })

  const signalItems = signalsData?.items ?? []
  const snapshots   = snapData?.snapshots ?? []
  const events      = evtData?.events    ?? []

  const histItems = (histData?.success === true && (histData.items?.length ?? 0) > 0)
    ? histData.items
    : []
  const useHistData = histItems.length > 0

  const chartData = useHistData
    ? histItems.map((item) => ({
        date:  item.date,
        hype:  item.market_heat_score,
        manip: item.volatility_anomaly_score,
        fomo:  item.fomo_score,
        sq:    item.short_squeeze_pressure,
      }))
    : [...snapshots].reverse().map((s) => ({
        date:  s.snapshot_date,
        hype:  s.social_hype_score,
        manip: s.manipulation_signal_score,
        fomo:  s.fomo_score,
        sq:    s.short_squeeze_pressure,
      }))

  const chartLoading       = histLoading || (!useHistData && snapLoading)
  const chartIsPhpFallback = !histLoading && !useHistData && snapshots.length > 0

  const fastapiSnapshot  = fastapiData?.data?.snapshots?.[0] ?? null
  const hasFastapi       = !!fastapiSnapshot
  const phpLatest        = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
  const latest           = fastapiSnapshot ?? phpLatest ?? null
  const usingPhpFallback = !hasFastapi && !!phpLatest

  // Payload-level errors: FastAPI can return HTTP 200 with success=false or a populated
  // errors array. Combine with React Query's network-level isError for full coverage.
  const hasSignalsPayloadError =
    signalsData?.success === false ||
    (signalsData?.errors?.length ?? 0) > 0
  const hasSnapshotPayloadError =
    fastapiData?.success === false ||
    (fastapiData?.errors?.length ?? 0) > 0
  const hasHistoryPayloadError =
    histData?.success === false ||
    (histData?.errors?.length ?? 0) > 0

  const effectiveSignalsError  = signalsError  || hasSignalsPayloadError
  const effectiveSnapshotError = fastapiSnapshotError || hasSnapshotPayloadError
  const effectiveHistoryError  = histError  || hasHistoryPayloadError

  // Computed fresh on every render — no useMemo to avoid stale results when
  // content changes but array length stays the same
  const caution = computeInvestorCaution(
    signalItems,
    fastapiSnapshot,
    histItems,
    phpLatest,
    {
      externalNewsError:   effectiveSignalsError,
      latestSnapshotError: effectiveSnapshotError,
      marketHistoryError:  effectiveHistoryError,
    },
  )

  const cautionColor   = SIGNAL_LEVEL_COLOR[caution.signalLevel]
  const cautionLoading = fastapiLoading || signalsLoading || histLoading

  // ── monitoring JSON (committed to repo by GitHub Actions, read via raw URL) ──
  const { data: monitoringJson } = useQuery({
    queryKey: ['monitoring-json'],
    queryFn: () => fetchMonitoringData<MonitoringJsonData>(),
    retry: 0,
    staleTime: 10 * 60_000,
  })

  const { data: marketModelData } = useQuery({
    queryKey: ['abnormal-return-market-model'],
    queryFn: async (): Promise<MarketModelJson | null> => {
      try {
        const res = await fetch(
          'https://raw.githubusercontent.com/UnaLu027/social-trade-risk/main/generated-data/abnormal-return-market-model.json',
          { cache: 'no-store' }
        )
        if (!res.ok) return null
        return (await res.json()) as MarketModelJson
      } catch { return null }
    },
    retry: 0,
    staleTime: 30 * 60_000,
  })
  const symbolMonData     = monitoringJson?.symbols?.[upper] ?? null
  const symbolLatest      = symbolMonData?.latest ?? null
  // Freshness is based only on last known-good data, never on a failed attempt's timestamp
  const lastFetchedAt     = symbolLatest?.fetched_at ?? null
  const freshness         = getFreshnessStatus(lastFetchedAt)
  const scheduledSummary  = symbolLatest?.summary ?? null
  const scheduledItems    = symbolLatest?.items ?? []
  // Last-attempt info: shows whether the most recent scheduled run succeeded
  const lastAttemptStatus = symbolMonData?.last_attempt_status ?? null
  const lastAttemptErrors = symbolMonData?.last_attempt_errors ?? []
  const lastAttemptFailed = lastAttemptStatus === 'error' || lastAttemptStatus === 'partial'

  // ── snapshot market status label (Chinese) ────────────────────────────────
  const snapshotZhLabel = latest?.ai_risk_label
    ? (RISK_LABEL_ZH[latest.ai_risk_label] ?? latest.ai_risk_label)
    : null

  // ── news coverage display string ──────────────────────────────────────────
  const newsCoverageText = (() => {
    if (signalsLoading)         return '載入中…'
    if (effectiveSignalsError)  return '取得失敗'
    if (caution.newsCoverage.scoredCount > 0) {
      return `可分析 ${caution.newsCoverage.scoredCount} 篇 / 原始 ${caution.newsCoverage.rawCount} 篇 · Finnhub`
    }
    return '無可分析新聞 · Finnhub'
  })()

  const newsCoverageColor = (() => {
    if (effectiveSignalsError)                   return '#ef4444'
    if (caution.newsCoverage.scoredCount > 0)    return '#10b981'
    return '#64748b'
  })()

  // ── export-ready computed strings ────────────────────────────────────────
  const snapshotStatusText = fastapiLoading ? '載入中…'
    : hasFastapi ? '可用'
    : phpLatest ? '歷史 fallback'
    : effectiveSnapshotError ? '取得失敗'
    : '無資料'

  const historyStatusText = histLoading ? '載入中…'
    : effectiveHistoryError ? '取得失敗'
    : histItems.length > 0 ? `${histItems.length} 個交易日`
    : '無資料'

  const exportInput: BriefExportInput = {
    symbol: upper,
    caution,
    signalItems: signalItems.map(s => ({
      headline:      s.headline,
      url:           s.url,
      ai_risk_label: s.ai_risk_label,
      ai_risk_score: s.ai_risk_score,
      published_at:  s.published_at,
      source:        s.source,
    })),
    histItems: histItems.map(h => ({
      date:                   h.date,
      market_heat_score:      h.market_heat_score,
      volatility_anomaly_score: h.volatility_anomaly_score,
      fomo_score:             h.fomo_score,
      short_squeeze_pressure: h.short_squeeze_pressure,
      market_risk_label:      h.market_risk_label,
    })),
    latestSnapshot: latest
      ? { snapshot_date: latest.snapshot_date, price: latest.price, ai_risk_label: latest.ai_risk_label }
      : null,
    snapshotIsPhpFallback: usingPhpFallback,
    newsCoverageText,
    snapshotStatusText,
    historyStatusText,
  }

  const handleCopy = async () => {
    await copySummary(exportInput)
    setCopyDone(true)
    setTimeout(() => setCopyDone(false), 2000)
  }

  const logExport = (exportType: string) => {
    phpApi.post('/report_exports.php', {
      symbol:         upper,
      export_type:    exportType,
      signal_level:   caution.signalLevel,
      combined_score: caution.score,
      exported_at:    new Date().toISOString(),
    }).catch(() => { /* export log failure must not block download */ })
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title={`綜合警戒摘要 · ${upper}`} />

      <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto w-full">

        {/* PHP fallback warning */}
        {!fastapiLoading && usingPhpFallback && (
          <div className="px-4 py-3 rounded-lg" style={{ background: '#1c1a05', border: '1px solid #78350f' }}>
            <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>最新市場資料暫時無法取得</p>
            <p className="text-xs mt-1" style={{ color: '#fcd34d' }}>以下快照來自 PHP/MySQL 歷史資料庫，非即時市場資料。</p>
          </div>
        )}

        {/* Title + latest risk */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">{upper}</h1>
            {latest && (
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {hasFastapi ? (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: '#052e16', color: '#10b981', border: '1px solid #065f46' }}
                  >
                    最新市場快照 · 規則式市場資料
                  </span>
                ) : (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: '#1c1a05', color: '#f59e0b', border: '1px solid #78350f' }}
                  >
                    歷史資料庫快照
                  </span>
                )}
                <span className="text-xs" style={{ color: '#64748b' }}>
                  {latest.snapshot_date}
                  {latest.price != null && <> · ${latest.price.toLocaleString()}</>}
                </span>
              </div>
            )}
          </div>
          {snapshotZhLabel && (
            <span
              className="text-sm font-bold px-3 py-1 rounded-full"
              style={{
                background: riskColor(latest?.ai_risk_label ?? null) + '22',
                color:      riskColor(latest?.ai_risk_label ?? null),
                border:     `1px solid ${riskColor(latest?.ai_risk_label ?? null)}`,
              }}
            >
              市場快照警戒：{snapshotZhLabel}
            </span>
          )}
        </div>

        {/* ── 資料涵蓋狀態列 ─────────────────────────────────────────────────── */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-3">
            <Info size={13} color="#64748b" />
            <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>已接入資料來源涵蓋狀態</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* 外部新聞文本訊號 */}
            <div className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
              <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>外部新聞文本訊號</div>
              <div className="text-xs font-semibold" style={{ color: newsCoverageColor }}>
                {newsCoverageText}
              </div>
            </div>

            {/* 最新市場快照 */}
            <div className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
              <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>最新市場快照</div>
              <div className="text-xs font-semibold" style={{
                color: fastapiLoading           ? '#64748b'
                     : hasFastapi              ? '#10b981'
                     : phpLatest               ? '#f59e0b'
                     : effectiveSnapshotError  ? '#ef4444'
                     : '#64748b',
              }}>
                {fastapiLoading          ? '載入中…'
                 : hasFastapi           ? '可用'
                 : phpLatest            ? '歷史 fallback'
                 : effectiveSnapshotError ? '取得失敗'
                 : '無資料'}
              </div>
            </div>

            {/* 近期市場趨勢 */}
            <div className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
              <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>近期市場趨勢</div>
              <div className="text-xs font-semibold" style={{
                color: histLoading            ? '#64748b'
                     : effectiveHistoryError  ? '#ef4444'
                     : histItems.length > 0   ? '#10b981'
                     : '#64748b',
              }}>
                {histLoading            ? '載入中…'
                 : effectiveHistoryError ? '取得失敗'
                 : histItems.length > 0  ? `${histItems.length} 個交易日`
                 : '無資料'}
              </div>
            </div>

            {/* 社群論壇資料 */}
            <div className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
              <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>社群論壇資料</div>
              <div className="text-xs font-semibold" style={{ color: '#475569' }}>尚未接入</div>
            </div>
          </div>
          <p className="text-[10px] mt-3 leading-relaxed" style={{ color: '#475569' }}>
            完整係指目前已接入之 Finnhub 外部新聞、最新市場快照與近期市場趨勢資料；社群論壇資料尚未納入本階段摘要。
          </p>
        </div>

        {/* ── 排程監控摘要 ─────────────────────────────────────────────────── */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <Clock size={13} color="#64748b" />
            <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>排程自動監控摘要</span>
            {lastFetchedAt && (
              <>
                <span className="text-[10px] font-mono" style={{ color: '#64748b' }}>
                  {formatFreshnessTime(lastFetchedAt)}
                </span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    background: FRESHNESS_COLOR[freshness] + '22',
                    color:      FRESHNESS_COLOR[freshness],
                    border:     `1px solid ${FRESHNESS_COLOR[freshness]}55`,
                  }}
                >
                  {FRESHNESS_LABEL[freshness]}
                </span>
              </>
            )}
          </div>

          {/* Last-attempt failure warning — shown above the data regardless */}
          {lastAttemptFailed && (
            <div className="rounded px-2.5 py-1.5 mb-2 text-[10px]"
              style={{ background: '#1c0505', border: '1px solid #7f1d1d', color: '#fca5a5' }}>
              最近排程執行失敗（{lastAttemptStatus}）
              {lastAttemptErrors.length > 0 && <>：{lastAttemptErrors[0].slice(0, 80)}</>}
              {lastFetchedAt && ' · 以下顯示上次成功資料'}
            </div>
          )}

          {!lastFetchedAt ? (
            <p className="text-xs" style={{ color: '#475569' }}>尚未完成首次自動更新。</p>
          ) : !scheduledSummary ? (
            <p className="text-xs" style={{ color: '#475569' }}>最近一次排程執行未能取得完整資料。</p>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Score chip row */}
              <div className="flex items-center gap-3 flex-wrap">
                {(() => {
                  const sigColor = SIGNAL_LEVEL_COLOR[scheduledSummary.signal_level as import('../lib/investorCaution').SignalLevel] ?? '#64748b'
                  const sigLabel = SIGNAL_LEVEL_LABEL[scheduledSummary.signal_level as import('../lib/investorCaution').SignalLevel] ?? scheduledSummary.signal_level
                  return (
                    <>
                      <span className="text-sm font-bold px-2.5 py-0.5 rounded-full"
                        style={{ background: sigColor + '22', color: sigColor, border: `1px solid ${sigColor}55` }}>
                        {sigLabel}
                      </span>
                      <span className="text-xs font-mono" style={{ color: '#64748b' }}>
                        {scheduledSummary.combined_score} / 100
                      </span>
                      <span className="text-[10px]" style={{ color: '#475569' }}>
                        {scheduledSummary.data_coverage === 'FULL' ? '完整涵蓋' : scheduledSummary.data_coverage}
                        {' · '}{scheduledSummary.interpretation_status === 'comprehensive' ? '綜合觀察' : '初步觀察'}
                      </span>
                    </>
                  )
                })()}
              </div>

              {/* Scheduled news items (compact) */}
              {scheduledItems.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="text-[10px] font-semibold" style={{ color: '#64748b' }}>排程擷取之新聞文本訊號</div>
                  {scheduledItems.slice(0, 3).map(item => {
                    const rc = item.ai_risk_label === 'Critical' ? '#ef4444' : item.ai_risk_label === 'High' ? '#f97316' : item.ai_risk_label === 'Medium' ? '#f59e0b' : '#10b981'
                    return (
                      <div key={item.id} className="rounded px-2.5 py-1.5 flex items-start gap-2" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                        {item.ai_risk_label && (
                          <span className="text-[10px] font-bold flex-shrink-0 mt-0.5 px-1 py-0.5 rounded"
                            style={{ background: rc + '22', color: rc, border: `1px solid ${rc}44` }}>
                            {item.ai_risk_label}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer"
                              className="text-xs leading-snug" style={{ color: '#e2e8f0' }}>
                              {item.headline ?? '（無標題）'}
                            </a>
                          ) : (
                            <span className="text-xs leading-snug text-white">{item.headline ?? '（無標題）'}</span>
                          )}
                          <div className="text-[10px] mt-0.5 font-mono" style={{ color: '#475569' }}>
                            {formatUtc(item.published_at)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 異常報酬觀察 ──────────────────────────────────────────────────── */}
        {(() => {
          const mm     = marketModelData?.symbols?.[upper]
          const simple = symbolLatest?.abnormal_return
          const useMarketModel = mm?.data_quality === 'computed_from_market_model'
          const hasSimple      = simple?.data_quality === 'computed_from_market_history'
          if (!useMarketModel && !hasSimple) return null

          const fmtPct = (v: number | null) =>
            v === null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`
          const arColor = (v: number | null) =>
            v === null ? '#64748b' : v > 0 ? '#10b981' : v < 0 ? '#ef4444' : '#64748b'

          // ── Market Model card (primary) ──────────────────────────────────
          if (useMarketModel && mm) {
            const RISK_COLORS: Record<string, string> = {
              low: '#10b981', medium: '#f59e0b', high: '#ef4444', critical: '#ef4444',
            }
            const RISK_ZH: Record<string, string> = {
              low: '低', medium: '中', high: '高', critical: '極高',
            }
            const riskColor = RISK_COLORS[mm.risk_level] ?? '#64748b'
            const interpText = mm.interpretation === 'outperforming'
              ? '此標的近期報酬明顯高於 Market Model 預期，可能存在事件或社群熱度驅動的異常表現。'
              : mm.interpretation === 'underperforming'
              ? '此標的近期報酬明顯低於 Market Model 預期，需留意反轉或負面事件風險。'
              : '目前相對 Market Model 預期偏離有限。'
            return (
              <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <TrendingUp size={13} color="#64748b" />
                  <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>異常報酬觀察</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#0f2a3f', color: '#38bdf8', border: '1px solid #2d4a6f' }}>
                    Market Model
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1e2235', color: '#64748b', border: '1px solid #2d3148' }}>
                    基準：{mm.benchmark_symbol}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                    style={{ background: riskColor + '22', color: riskColor, border: `1px solid ${riskColor}55` }}
                  >
                    {RISK_ZH[mm.risk_level] ?? mm.risk_level}風險
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                    <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>1 日異常報酬</div>
                    <div className="text-sm font-mono font-bold" style={{ color: arColor(mm.abnormal_return_1d) }}>
                      {fmtPct(mm.abnormal_return_1d)}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#475569' }}>
                      Z = {mm.abnormal_return_zscore.toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                    <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>5 日累積異常報酬（CAR）</div>
                    <div className="text-sm font-mono font-bold" style={{ color: arColor(mm.CAR_5d) }}>
                      {fmtPct(mm.CAR_5d)}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: '#475569' }}>
                      Z = {mm.CAR_5d_zscore.toFixed(2)}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 flex-wrap mb-3">
                  {([
                    ['α', mm.alpha.toFixed(4)],
                    ['β', mm.beta.toFixed(3)],
                    ['R²', `${(mm.train_r2 * 100).toFixed(1)}%`],
                    ['估計期', `${mm.estimation_days} 天`],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <span className="text-[10px]" style={{ color: '#475569' }}>{label}</span>
                      <span className="text-[11px] font-mono font-semibold" style={{ color: '#94a3b8' }}>{val}</span>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] leading-relaxed mb-2" style={{ color: '#94a3b8' }}>
                  {interpText}
                </p>
                <p className="text-[10px] leading-relaxed" style={{ color: '#334155' }}>
                  異常報酬 = 實際報酬 − 預期正常報酬；預期正常報酬由 Market Model 估計：個股報酬 = α + β × SPY 報酬。估計期：{mm.estimation_start} 至 {mm.estimation_end}。僅作輔助觀察，不代表投資建議。
                </p>
              </div>
            )
          }

          // ── Fallback: simple version ─────────────────────────────────────
          const s = simple!
          const simpleInterpText = s.abnormal_return_5d === null ? null
            : s.abnormal_return_5d >  0.05
            ? '此標的近期報酬明顯高於大盤，可能存在事件或社群熱度驅動的異常表現。'
            : s.abnormal_return_5d < -0.05
            ? '此標的近期報酬明顯低於大盤，需留意反轉或負面事件風險。'
            : '目前相對大盤偏離有限。'
          return (
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <TrendingUp size={13} color="#64748b" />
                <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>異常報酬觀察</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1c1a05', color: '#f59e0b', border: '1px solid #78350f' }}>
                  簡化版
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#1e2235', color: '#64748b', border: '1px solid #2d3148' }}>
                  基準：{s.benchmark_symbol}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                  <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>1 日異常報酬</div>
                  <div className="text-sm font-mono font-bold" style={{ color: arColor(s.abnormal_return_1d) }}>
                    {fmtPct(s.abnormal_return_1d)}
                  </div>
                  <div className="text-[10px] mt-0.5 flex gap-2" style={{ color: '#475569' }}>
                    <span>股票 {fmtPct(s.stock_return_1d)}</span>
                    <span>SPY {fmtPct(s.benchmark_return_1d)}</span>
                  </div>
                </div>
                <div className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                  <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>5 日異常報酬</div>
                  <div className="text-sm font-mono font-bold" style={{ color: arColor(s.abnormal_return_5d) }}>
                    {fmtPct(s.abnormal_return_5d)}
                  </div>
                  <div className="text-[10px] mt-0.5 flex gap-2" style={{ color: '#475569' }}>
                    <span>股票 {fmtPct(s.stock_return_5d)}</span>
                    <span>SPY {fmtPct(s.benchmark_return_5d)}</span>
                  </div>
                </div>
              </div>
              {simpleInterpText && (
                <p className="text-[11px] leading-relaxed mb-2" style={{ color: '#94a3b8' }}>
                  {simpleInterpText}
                </p>
              )}
              <p className="text-[10px]" style={{ color: '#334155' }}>
                此為簡化版異常報酬：個股報酬 − SPY 報酬。僅作輔助觀察，不代表投資建議。
              </p>
            </div>
          )
        })()}

        {/* ── 綜合警戒摘要卡（即時） ────────────────────────────────────────── */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: `1px solid ${cautionColor}44` }}>
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={14} color={cautionColor} />
            <span className="text-sm font-semibold text-white">外部新聞與市場訊號綜合警戒摘要</span>
          </div>
          <div className="text-[10px] mb-3" style={{ color: '#475569' }}>
            即時資料查詢結果（Hugging Face 即時計算 · 不與排程更新時間對應）
          </div>

          {cautionLoading ? (
            <div className="h-32 animate-pulse rounded" style={{ background: '#2d3148' }} />
          ) : caution.signalLevel === 'insufficient_data' ? (
            <div>
              <p className="text-xs py-4 text-center" style={{ color: '#64748b' }}>資料不足，無法產生警戒摘要。</p>
              <div className="rounded p-3" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                <div className="text-[11px] font-semibold mb-1" style={{ color: '#64748b' }}>綜合警戒摘要報告</div>
                <div className="text-[10px] mb-3" style={{ color: '#475569' }}>資料不足時仍可匯出，報告將清楚標示來源狀態。</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { icon: <Copy size={15} />, label: copyDone ? '已複製' : '複製摘要', action: handleCopy },
                    { icon: <FileText size={15} />, label: '下載 Word', action: () => { downloadWord(exportInput); logExport('word') } },
                    { icon: <Printer size={15} />, label: '列印 / PDF', action: () => { printReport(exportInput); logExport('pdf') } },
                    { icon: <Globe size={15} />, label: '下載 HTML', action: () => { downloadHtml(exportInput); logExport('html') } },
                  ].map(({ icon, label, action }) => (
                    <button
                      key={label}
                      onClick={action}
                      className="flex flex-col items-center gap-1.5 rounded p-2.5"
                      style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
                    >
                      <span style={{ color: '#64748b' }}>{icon}</span>
                      <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: '#64748b' }}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Status row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded p-2.5 text-center" style={{ background: '#0f1117', border: `1px solid ${cautionColor}44` }}>
                  <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>訊號等級</div>
                  <div className="text-sm font-bold" style={{ color: cautionColor }}>
                    {SIGNAL_LEVEL_LABEL[caution.signalLevel]}
                  </div>
                  <div className="text-[10px] mt-0.5 font-mono" style={{ color: '#64748b' }}>
                    {caution.score} / 100
                  </div>
                </div>
                <div className="rounded p-2.5 text-center" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                  <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>已接入來源涵蓋</div>
                  <div className="text-sm font-bold text-white">{COVERAGE_LABEL[caution.dataCoverage]}</div>
                </div>
                <div className="rounded p-2.5 text-center" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                  <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>分析狀態</div>
                  <div className="text-sm font-bold text-white">{INTERPRETATION_LABEL[caution.interpretationStatus]}</div>
                </div>
              </div>

              {/* Score breakdown */}
              <div className="rounded p-3 flex flex-col gap-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                <div className="text-[11px] font-semibold mb-1" style={{ color: '#64748b' }}>計分明細</div>
                <ScoreBar label="外部新聞文本訊號 (Finnhub)" score={caution.scoreBreakdown.externalNews} />
                <ScoreBar label="最新市場快照"               score={caution.scoreBreakdown.latestMarketSnapshot} />
                <ScoreBar label="近期市場趨勢"               score={caution.scoreBreakdown.marketHistory} />
              </div>

              {/* Key factors */}
              {caution.keyFactors.length > 0 && (
                <div className="rounded p-3" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                  <div className="text-[11px] font-semibold mb-2" style={{ color: '#64748b' }}>主要警戒因子</div>
                  <div className="flex flex-col gap-2">
                    {caution.keyFactors.map((f, i) => (
                      <div key={i} className="flex gap-2">
                        <AlertTriangle size={11} color={cautionColor} className="mt-0.5 flex-shrink-0" />
                        <div>
                          <div className="text-xs text-white leading-snug">{f.description}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>
                            {f.source}
                            {f.sourceDate && <> · {formatUtc(f.sourceDate)}</>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Coverage note */}
              {caution.coverageNote && (
                <p className="text-[11px] leading-relaxed" style={{ color: '#94a3b8' }}>
                  {caution.coverageNote}
                </p>
              )}

              <div className="text-[10px] font-mono" style={{ color: '#475569' }}>
                生成時間：{formatUtc(caution.generatedAt)} UTC
              </div>

              {/* ── 匯出按鈕區 ── */}
              <div className="rounded p-3 mt-1" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                <div className="text-[11px] font-semibold mb-1" style={{ color: '#64748b' }}>綜合警戒摘要報告</div>
                <div className="text-[10px] mb-3" style={{ color: '#475569' }}>
                  匯出目前已接入來源之警戒摘要與查證資訊。
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { icon: <Copy size={15} />, label: copyDone ? '已複製' : '複製摘要', action: handleCopy, color: copyDone ? '#10b981' : '#38bdf8' },
                    { icon: <FileText size={15} />, label: '下載 Word', action: () => { downloadWord(exportInput); logExport('word') }, color: '#38bdf8' },
                    { icon: <Printer size={15} />, label: '列印 / PDF', action: () => { printReport(exportInput); logExport('pdf') }, color: '#38bdf8' },
                    { icon: <Globe size={15} />, label: '下載 HTML', action: () => { downloadHtml(exportInput); logExport('html') }, color: '#38bdf8' },
                  ].map(({ icon, label, action, color }) => (
                    <button
                      key={label}
                      onClick={action}
                      className="flex flex-col items-center gap-1.5 rounded p-2.5 transition-colors"
                      style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = '#38bdf8')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = '#2d3148')}
                    >
                      <span style={{ color }}>{icon}</span>
                      <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: '#94a3b8' }}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── 固定聲明卡片 ─────────────────────────────────────────────────── */}
        <div className="rounded-lg p-4" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
          <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>
            本摘要整合目前可取得之外部新聞文本訊號與市場資料，用於觀察風險訊號強度，
            不構成投資建議，也不代表價格走勢。投資判斷仍應結合公司公告、財報、估值、
            風險承受能力與專業意見。
          </p>
        </div>

        {/* ── 交叉查證建議 ──────────────────────────────────────────────────── */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-3">
            <Info size={13} color="#38bdf8" />
            <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>交叉查證建議</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {[
              '查閱公司官方公告與 IR 資訊',
              '核對財報、重大訊息與交易所公告',
              '比較多個獨立新聞來源',
              '觀察市場波動與外部新聞訊號是否同步升高',
              '社群論壇資料尚未接入，勿將目前摘要視為完整社群熱度分析',
            ].map((tip, i) => (
              <li key={i} className="flex gap-2 text-xs" style={{ color: '#94a3b8' }}>
                <span style={{ color: '#38bdf8', flexShrink: 0 }}>·</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>

        {/* ── 近期市場風險趨勢 chart ────────────────────────────────────────── */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} color="#38bdf8" />
            <span className="text-sm font-semibold text-white">近期市場風險趨勢</span>
            {!chartLoading && useHistData && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: '#052e16', color: '#10b981', border: '1px solid #065f46' }}
              >
                market_history_rule_based
              </span>
            )}
          </div>
          {!chartLoading && chartIsPhpFallback && (
            <p className="text-xs mb-3" style={{ color: '#f59e0b' }}>
              歷史資料庫 fallback：近期市場歷史資料暫時無法取得。
            </p>
          )}
          {chartLoading ? (
            <div className="h-48 animate-pulse rounded" style={{ background: '#2d3148' }} />
          ) : chartData.length === 0 ? (
            <p className="text-xs text-center py-8" style={{ color: '#64748b' }}>無快照資料</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="#2d3148" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 6 }}
                  labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                  itemStyle={{ fontSize: 11 }}
                />
                <Line dataKey="hype"  name="炒作分數"  stroke="#ef4444" dot={false} strokeWidth={2} />
                <Line dataKey="manip" name="操縱信號"  stroke="#f97316" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                <Line dataKey="fomo"  name="FOMO"       stroke="#a78bfa" dot={false} strokeWidth={1.5} />
                <Line dataKey="sq"    name="軋空壓力"  stroke="#38bdf8" dot={false} strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── 歷史事件紀錄 ──────────────────────────────────────────────────── */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={14} color="#10b981" />
            <span className="text-sm font-semibold text-white">歷史事件紀錄</span>
          </div>
          {evtLoading ? (
            <div className="h-24 animate-pulse rounded" style={{ background: '#2d3148' }} />
          ) : events.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#64748b' }}>無事件記錄</p>
          ) : (
            <div className="flex flex-col gap-0">
              {events.map((evt, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div
                      className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: riskColor(evt.risk_impact), border: `2px solid ${riskColor(evt.risk_impact)}` }}
                    />
                    {i < events.length - 1 && (
                      <div className="w-px flex-1 mt-0.5" style={{ background: '#2d3148', minHeight: 20 }} />
                    )}
                  </div>
                  <div className="pb-4">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] font-mono" style={{ color: '#64748b' }}>{evt.event_date}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: '#2d3148', color: '#94a3b8' }}
                      >
                        {EVENT_TYPE_LABELS[evt.event_type] ?? evt.event_type}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-white">{evt.title}</div>
                    <div className="text-xs mt-0.5 leading-relaxed" style={{ color: '#64748b' }}>
                      {evt.description}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 最新外部新聞文本訊號 ──────────────────────────────────────────── */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Newspaper size={14} color="#f59e0b" />
              <span className="text-sm font-semibold text-white">最新外部新聞文本訊號</span>
            </div>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: '#052e16', color: '#10b981', border: '1px solid #065f46' }}
            >
              live_social_signals
            </span>
          </div>
          <p className="text-[10px] mb-4 leading-relaxed" style={{ color: '#475569' }}>
            目前資料來源為 Finnhub 新聞；系統分析新聞文本中是否含有社群交易風險語言，尚未代表論壇社群討論熱度。
          </p>
          {signalsLoading ? (
            <div className="h-24 animate-pulse rounded" style={{ background: '#2d3148' }} />
          ) : signalItems.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#64748b' }}>
              最新外部新聞訊號暫時無法取得
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {signalItems.map((item) => (
                <div key={item.id} className="rounded p-3" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {item.ai_risk_label && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            background: riskColor(item.ai_risk_label) + '22',
                            color:      riskColor(item.ai_risk_label),
                            border:     `1px solid ${riskColor(item.ai_risk_label)}55`,
                          }}
                        >
                          {item.ai_risk_label}
                        </span>
                      )}
                      {item.ai_risk_score != null && (
                        <span className="text-[11px]" style={{ color: '#94a3b8' }}>{item.ai_risk_score}</span>
                      )}
                    </div>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: '#2d3148', color: '#94a3b8' }}
                    >
                      {item.source}
                    </span>
                  </div>
                  {item.headline && (
                    <div className="text-sm font-semibold text-white leading-snug mb-1">{item.headline}</div>
                  )}
                  {item.summary && (
                    <div className="text-xs leading-relaxed mb-1.5" style={{ color: '#64748b' }}>
                      {item.summary.length > 120 ? item.summary.slice(0, 120) + '…' : item.summary}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono" style={{ color: '#475569' }}>
                      {formatUtc(item.published_at)}
                    </span>
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center"
                        style={{ color: '#38bdf8' }}
                      >
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                  {item.ai_highlighted_terms && item.ai_highlighted_terms.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {item.ai_highlighted_terms.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: '#1e1b38', color: '#a78bfa' }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── GME 事件背景 ──────────────────────────────────────────────────── */}
        {upper === 'GME' && (
          <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={14} color="#a78bfa" />
              <span className="text-sm font-semibold text-white">GME 事件背景</span>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: '#94a3b8' }}>
              {GME_NARRATIVE.trim()}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
