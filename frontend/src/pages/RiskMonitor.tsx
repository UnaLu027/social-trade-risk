import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, TrendingUp, RefreshCw, Eye, Clock } from 'lucide-react'
import { phpGet } from '../api/phpClient'
import { api } from '../api/client'
import { TopBar } from '../components/layout/TopBar'
import { TickerAutocomplete } from '../components/TickerAutocomplete'
import {
  getFreshnessStatus, formatFreshnessTime,
  FRESHNESS_LABEL, FRESHNESS_COLOR,
} from '../lib/monitoringFreshness'

const DEFAULT_SYMBOLS = ['GME', 'AMC', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMD', 'NFLX']
const WATCHLIST_KEY   = 'social_risk_watchlist_v1'
const MAX_WATCHLIST   = 20

function loadWatchlist(): string[] {
  try {
    const stored = localStorage.getItem(WATCHLIST_KEY)
    if (stored !== null) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) return parsed as string[]
    }
  } catch { /* ignore */ }
  return DEFAULT_SYMBOLS
}

function saveWatchlist(list: string[]) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

// ── types ────────────────────────────────────────────────────────────────────

// Scheduled news item (from monitoring JSON latest.items)
interface ScheduledNewsItem {
  id: string
  headline: string | null
  url: string | null
  published_at: string
  source: string
  ai_risk_label: string | null
  ai_risk_score: number | null
}

// Compact history entry (summary only, no items, to control JSON size)
interface ScheduledHistoryEntry {
  fetched_at: string
  refresh_status: string
  summary: {
    signal_level: string
    combined_score: number
    data_coverage: string
    interpretation_status: string
  } | null
}

interface ScheduledLatest {
  fetched_at: string
  refresh_status: string
  fetch_errors: string[]
  summary: {
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
  } | null
  items: ScheduledNewsItem[]
  news_count: number
}

interface SymbolMonitorData {
  latest: ScheduledLatest
  history: ScheduledHistoryEntry[]
}

interface MonitoringJsonData {
  generated_at: string
  refresh_status: string
  symbols: Record<string, SymbolMonitorData>
}



interface RiskSnapshot {
  symbol: string
  name: string | null
  snapshot_date: string
  price: number | null
  volume: number | null
  mention_count: number | null
  bullish_ratio: number | null
  avg_sentiment: number | null
  social_hype_score: number | null
  manipulation_signal_score: number | null
  fomo_score: number | null
  short_squeeze_pressure: number | null
  ai_risk_label: 'Critical' | 'High' | 'Medium' | 'Low' | null
  data_quality: string | null
}

// ── static fallback data (always shown if PHP unavailable) ──────────────────

const DEMO_SNAPSHOTS: RiskSnapshot[] = [
  { symbol: 'GME',  name: 'GameStop Corp.',             snapshot_date: '2021-01-27', price: 347.51, volume: 297000000, mention_count: 18000, bullish_ratio: 0.95, avg_sentiment: 0.85, social_hype_score: 99, manipulation_signal_score: 95, fomo_score: 98, short_squeeze_pressure: 99, ai_risk_label: 'Critical', data_quality: 'demo' },
  { symbol: 'AMC',  name: 'AMC Entertainment Holdings', snapshot_date: '2021-01-27', price: 19.90,  volume: 120000000, mention_count: 6200,  bullish_ratio: 0.79, avg_sentiment: 0.61, social_hype_score: 78, manipulation_signal_score: 66, fomo_score: 73, short_squeeze_pressure: 82, ai_risk_label: 'High', data_quality: 'demo' },
  { symbol: 'BB',   name: 'BlackBerry Ltd.',             snapshot_date: '2021-01-27', price: 25.10,  volume: 87000000,  mention_count: 4200,  bullish_ratio: 0.74, avg_sentiment: 0.56, social_hype_score: 70, manipulation_signal_score: 58, fomo_score: 66, short_squeeze_pressure: 74, ai_risk_label: 'High', data_quality: 'demo' },
  { symbol: 'KOSS', name: 'Koss Corporation',            snapshot_date: '2021-01-27', price: 58.00,  volume: 32000000,  mention_count: 2600,  bullish_ratio: 0.77, avg_sentiment: 0.60, social_hype_score: 76, manipulation_signal_score: 62, fomo_score: 71, short_squeeze_pressure: 80, ai_risk_label: 'High', data_quality: 'demo' },
  { symbol: 'NOK',  name: 'Nokia Corporation',           snapshot_date: '2021-01-27', price: 6.55,   volume: 240000000, mention_count: 3500,  bullish_ratio: 0.68, avg_sentiment: 0.43, social_hype_score: 60, manipulation_signal_score: 44, fomo_score: 55, short_squeeze_pressure: 52, ai_risk_label: 'Medium', data_quality: 'demo' },
  { symbol: 'TSLA', name: 'Tesla Inc.',                  snapshot_date: '2021-01-27', price: 864.16, volume: 45000000,  mention_count: 3100,  bullish_ratio: 0.64, avg_sentiment: 0.42, social_hype_score: 52, manipulation_signal_score: 31, fomo_score: 44, short_squeeze_pressure: 26, ai_risk_label: 'Medium', data_quality: 'demo' },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.',  snapshot_date: '2021-01-27', price: 39.00,  volume: 76000000,  mention_count: 2900,  bullish_ratio: 0.66, avg_sentiment: 0.40, social_hype_score: 55, manipulation_signal_score: 36, fomo_score: 48, short_squeeze_pressure: 34, ai_risk_label: 'Medium', data_quality: 'demo' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation',          snapshot_date: '2021-01-27', price: 133.20, volume: 38000000,  mention_count: 1800,  bullish_ratio: 0.59, avg_sentiment: 0.31, social_hype_score: 42, manipulation_signal_score: 24, fomo_score: 31, short_squeeze_pressure: 18, ai_risk_label: 'Low', data_quality: 'demo' },
]

// ── helpers ──────────────────────────────────────────────────────────────────

const RISK_CFG = {
  Critical: { color: '#ef4444', bg: '#450a0a', border: '#991b1b' },
  High:     { color: '#f97316', bg: '#431407', border: '#9a3412' },
  Medium:   { color: '#f59e0b', bg: '#451a03', border: '#92400e' },
  Low:      { color: '#10b981', bg: '#052e16', border: '#065f46' },
}

const SIG_COLOR: Record<string, string> = {
  low: '#10b981', medium: '#f59e0b', high: '#f97316',
  extreme: '#ef4444', insufficient_data: '#64748b',
}
const SIG_LABEL: Record<string, string> = {
  low: '低警戒', medium: '中警戒', high: '高警戒',
  extreme: '極高警戒', insufficient_data: '資料不足',
}
const RISK_ZH: Record<string, string> = {
  Low: '低警戒', Medium: '中警戒', High: '高警戒', Critical: '極高警戒',
}
const INTERP_LABEL: Record<string, string> = {
  comprehensive: '綜合觀察', preliminary: '初步觀察', insufficient_data: '資料不足',
}

function formatHistTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

function riskCfg(label: string | null) {
  return RISK_CFG[label as keyof typeof RISK_CFG] ?? RISK_CFG.Low
}

function ScoreBar({ value, color }: { value: number | null; color: string }) {
  const pct = Math.min(100, Math.max(0, value ?? 0))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: '#2d3148' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-mono w-6 text-right" style={{ color }}>{pct.toFixed(0)}</span>
    </div>
  )
}

function RiskCard({ snap, onView, onRemove }: { snap: RiskSnapshot; onView: () => void; onRemove: () => void }) {
  const cfg = riskCfg(snap.ai_risk_label)
  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3 cursor-pointer transition-opacity hover:opacity-90"
      style={{ background: '#1a1d27', border: `1px solid ${cfg.border}` }}
      onClick={onView}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-base font-bold text-white">{snap.symbol}</div>
          <div className="text-xs mt-0.5 truncate max-w-[140px]" style={{ color: '#64748b' }}>
            {snap.name ?? '—'}
          </div>
        </div>
        <span
          className="text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}
        >
          {snap.ai_risk_label ?? 'N/A'}
        </span>
      </div>

      {/* Price */}
      {snap.price != null && (
        <div className="font-mono text-sm font-semibold text-white">
          ${snap.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          {snap.data_quality === 'demo' && (
            <span className="ml-2 text-[10px] font-normal" style={{ color: '#64748b' }}>demo</span>
          )}
          {snap.data_quality === 'market_snapshot_rule_based' && (
            <span className="ml-2 text-[10px] font-normal" style={{ color: '#10b981' }}>market</span>
          )}
        </div>
      )}

      {/* Score bars */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-[10px] mb-0.5" style={{ color: '#475569' }}>
          <span>社交炒作</span><span>操縱信號</span><span>FOMO</span><span>軋空壓力</span>
        </div>
        <ScoreBar value={snap.social_hype_score}          color={cfg.color} />
        <ScoreBar value={snap.manipulation_signal_score}  color='#f97316'  />
        <ScoreBar value={snap.fomo_score}                 color='#a78bfa'  />
        <ScoreBar value={snap.short_squeeze_pressure}     color='#38bdf8'  />
      </div>

      {/* Mentions + actions */}
      <div className="flex items-center justify-between text-xs" style={{ color: '#64748b' }}>
        <span>提及數 {snap.mention_count?.toLocaleString() ?? '—'}</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onRemove() }}
            className="px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors"
            style={{ background: '#2d3148', color: '#64748b', border: '1px solid #3d4163' }}
          >
            移除
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onView() }}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors"
            style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
          >
            <Eye size={10} /> 詳情
          </button>
        </div>
      </div>
    </div>
  )
}

// ── main page ────────────────────────────────────────────────────────────────

export function RiskMonitor() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<'All' | 'Critical' | 'High' | 'Medium' | 'Low'>('All')
  const [searchTicker, setSearchTicker] = useState('')
  const [searchError,  setSearchError]  = useState('')
  const [watchlist, setWatchlist]       = useState<string[]>(loadWatchlist)

  function persistWatchlist(list: string[]) {
    setWatchlist(list)
    saveWatchlist(list)
  }

  function handleAddToWatchlist() {
    const val = searchTicker.trim().toUpperCase()
    if (!val) { setSearchError('請輸入股票代號。'); return }
    if (!/^[A-Z0-9.\-]+$/.test(val)) { setSearchError('代號格式錯誤，僅允許 A–Z、0–9、"."、"-"。'); return }
    if (val.includes('.TW')) { setSearchError('目前僅支援美股。'); return }
    if (watchlist.includes(val)) { setSearchError(`${val} 已在觀察清單中。`); return }
    if (watchlist.length >= MAX_WATCHLIST) { setSearchError(`觀察清單最多 ${MAX_WATCHLIST} 檔。`); return }
    setSearchError('')
    persistWatchlist([...watchlist, val])
    setSearchTicker('')
  }

  function handleViewReport() {
    const val = searchTicker.trim().toUpperCase()
    if (!val) { setSearchError('請輸入股票代號。'); return }
    if (!/^[A-Z0-9.\-]+$/.test(val)) { setSearchError('代號格式錯誤，僅允許 A–Z、0–9、"."、"-"。'); return }
    if (val.includes('.TW')) { setSearchError('目前僅支援美股。'); return }
    setSearchError('')
    navigate(`/risk-report/${val}`)
  }

  function handleRemove(sym: string) {
    persistWatchlist(watchlist.filter(s => s !== sym))
  }

  function handleReset() {
    persistWatchlist(DEFAULT_SYMBOLS)
  }

  const symbolsParam = watchlist.join(',')

  // FastAPI market snapshots (primary source)
  const {
    data: fastapiData,
    isLoading: fastapiIsLoading,
    isFetching: fastapiIsFetching,
    refetch: fastapiRefetch,
    dataUpdatedAt: fastapiUpdatedAt,
  } = useQuery({
    queryKey: ['fastapi-market-snapshots', symbolsParam],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean
        count: number
        fetched_at: string
        data: { count: number; snapshots: RiskSnapshot[] }
        errors: { symbol: string; error: string }[]
      }>(`/api/v1/market-snapshots?symbols=${symbolsParam}`)
      return res.data
    },
    retry: 1,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  })

  // PHP/MySQL snapshots (fallback)
  const {
    data: phpData,
    isLoading: phpIsLoading,
    isFetching: phpIsFetching,
    refetch: phpRefetch,
    dataUpdatedAt: phpUpdatedAt,
  } = useQuery({
    queryKey: ['php-risk-snapshots'],
    queryFn: async () => {
      const res = await phpGet<{ count: number; snapshots: RiskSnapshot[] }>('/risk_snapshots.php')
      return res.snapshots
    },
    retry: 1,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  })

  // ── History monitoring ──────────────────────────────────────────────────────
  const [selectedHistorySymbol, setSelectedHistorySymbol] = useState<string>(
    watchlist.length > 0 ? watchlist[0] : 'GME'
  )

  const { data: monitoringJson } = useQuery({
    queryKey: ['monitoring-json'],
    queryFn:  () => phpGet<MonitoringJsonData | null>('/monitoring-data.php'),
    retry:    0,
    staleTime: 10 * 60_000,
  })

  const symbolMonitorData = monitoringJson?.symbols?.[selectedHistorySymbol] ?? null
  const historySummaries  = symbolMonitorData?.history ?? []
  const historyNews       = symbolMonitorData?.latest?.items ?? []
  const lastFetchedAt     = symbolMonitorData?.latest?.fetched_at ?? monitoringJson?.generated_at ?? null
  const freshness         = getFreshnessStatus(lastFetchedAt)

  // Data priority: FastAPI (non-empty) > PHP > DEMO
  // Empty array from FastAPI (all tickers rate-limited) must NOT block PHP fallback
  const fastapiSnapshots  = fastapiData?.data?.snapshots ?? []
  const hasFastapiData    = fastapiSnapshots.length > 0
  const hasPhpData        = !!phpData && phpData.length > 0

  const snapshots = hasFastapiData
    ? fastapiSnapshots
    : hasPhpData
      ? phpData!
      : DEMO_SNAPSHOTS

  const usingDemo        = !hasFastapiData && !hasPhpData
  const usingPhpFallback = !hasFastapiData && hasPhpData
  const hasPartialErrors = !!fastapiData && (fastapiData.errors?.length ?? 0) > 0
  const hasDemoQuality   = usingPhpFallback && phpData!.some(s => s.data_quality === 'demo')

  const isLoading     = fastapiIsLoading && phpIsLoading
  const isFetching    = fastapiIsFetching || phpIsFetching
  const dataUpdatedAt = hasFastapiData ? fastapiUpdatedAt : phpUpdatedAt

  const filtered = filter === 'All'
    ? snapshots
    : snapshots.filter((s) => s.ai_risk_label === filter)

  const counts = {
    Critical: snapshots.filter(s => s.ai_risk_label === 'Critical').length,
    High:     snapshots.filter(s => s.ai_risk_label === 'High').length,
    Medium:   snapshots.filter(s => s.ai_risk_label === 'Medium').length,
    Low:      snapshots.filter(s => s.ai_risk_label === 'Low').length,
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar
        title="風險監控中心"
        showTickerTabs={false}
        showBell={false}
        showAvatar={false}
      />

      <div className="p-6 flex flex-col gap-6">

        {/* Ticker search */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <TickerAutocomplete
              value={searchTicker}
              onChange={(v) => { setSearchTicker(v); if (searchError) setSearchError('') }}
              onSubmit={() => handleViewReport()}
              placeholder="搜尋美股代號…"
              className="w-52"
            />
            <button
              onClick={handleViewReport}
              className="px-3 py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
            >
              查看報告
            </button>
            <button
              onClick={handleAddToWatchlist}
              className="px-3 py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: '#2d3148', color: '#94a3b8', border: '1px solid #3d4163' }}
            >
              加入觀察清單
            </button>
            <button
              onClick={handleReset}
              className="px-2.5 py-2 rounded-md text-xs font-semibold transition-opacity hover:opacity-80"
              style={{ background: '#1a1d27', color: '#475569', border: '1px solid #2d3148' }}
              title="重設預設清單"
            >
              重設預設清單
            </button>
          </div>
          {searchError && (
            <p className="text-xs" style={{ color: '#f59e0b' }}>{searchError}</p>
          )}
        </div>

        {/* Both sources failed → demo fallback */}
        {usingDemo && (
          <div className="px-4 py-3 rounded-lg" style={{ background: '#1c1a05', border: '1px solid #78350f' }}>
            <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>目前無法連接 API</p>
            <p className="text-xs mt-1" style={{ color: '#fcd34d' }}>暫時顯示 historical demo data。</p>
          </div>
        )}

        {/* FastAPI failed, using PHP fallback */}
        {usingPhpFallback && (
          <div className="px-4 py-3 rounded-lg" style={{ background: '#0f1a2e', border: '1px solid #1e3a5f' }}>
            <p className="text-sm font-semibold" style={{ color: '#38bdf8' }}>使用 PHP/MySQL 備援資料</p>
            <p className="text-xs mt-1" style={{ color: '#7dd3fc' }}>FastAPI 暫時無回應，已切換至備援資料來源。</p>
          </div>
        )}

        {/* FastAPI returned but some tickers failed */}
        {hasPartialErrors && (
          <div className="px-4 py-3 rounded-lg" style={{ background: '#1c1205', border: '1px solid #92400e' }}>
            <p className="text-sm font-semibold" style={{ color: '#fb923c' }}>部分 ticker 暫時無法取得最新市場資料</p>
            <p className="text-xs mt-1" style={{ color: '#fdba74' }}>其餘標的資料正常顯示。</p>
          </div>
        )}

        {/* PHP data contains demo-quality rows */}
        {hasDemoQuality && (
          <div className="px-4 py-3 rounded-lg" style={{ background: '#1a1505', border: '1px solid #92400e' }}>
            <p className="text-sm font-semibold" style={{ color: '#fb923c' }}>Historical demo data</p>
            <p className="text-xs mt-1" style={{ color: '#fdba74' }}>目前顯示的是歷史展示資料，尚非即時市場風險監控。</p>
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['Critical','High','Medium','Low'] as const).map((level) => {
            const c = riskCfg(level)
            return (
              <button
                key={level}
                onClick={() => setFilter(filter === level ? 'All' : level)}
                className="rounded-lg p-3 text-left transition-opacity hover:opacity-80"
                style={{
                  background: filter === level ? c.bg : '#1a1d27',
                  border: `1px solid ${filter === level ? c.border : '#2d3148'}`,
                }}
              >
                <div className="text-xl font-bold" style={{ color: c.color }}>{counts[level]}</div>
                <div className="text-xs mt-0.5 font-semibold" style={{ color: c.color }}>{level} Risk</div>
              </button>
            )
          })}
        </div>

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} color="#ef4444" />
            <span className="text-sm font-semibold text-white">US 市場風險看板</span>
            <span className="text-xs" style={{ color: '#64748b' }}>{filtered.length} 個標的</span>
          </div>
          <div className="flex items-center gap-2">
            {isFetching && <RefreshCw size={12} className="animate-spin" style={{ color: '#38bdf8' }} />}
            {dataUpdatedAt > 0 && (
              <span className="text-xs" style={{ color: '#64748b' }}>
                {new Date(dataUpdatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => { fastapiRefetch(); phpRefetch() }}
              className="p-1.5 rounded transition-opacity"
              style={{ color: '#38bdf8' }}
              title="重新整理"
            >
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {/* Risk grid */}
        {watchlist.length === 0 ? (
          <div className="rounded-lg p-10 flex flex-col items-center gap-3"
               style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
            <ShieldAlert size={28} color="#2d3148" />
            <p className="text-sm" style={{ color: '#64748b' }}>尚未加入觀察清單。請搜尋美股代號並加入。</p>
            <button onClick={handleReset} className="text-xs px-3 py-1.5 rounded font-semibold"
                    style={{ background: '#2d3148', color: '#94a3b8', border: '1px solid #3d4163' }}>
              重設預設清單
            </button>
          </div>
        ) : isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: watchlist.length }).map((_, i) => (
              <div key={i} className="h-52 rounded-lg animate-pulse" style={{ background: '#2d3148' }} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((snap) => (
              <RiskCard
                key={snap.symbol}
                snap={snap}
                onView={() => navigate(`/risk-report/${snap.symbol}`)}
                onRemove={() => handleRemove(snap.symbol)}
              />
            ))}
          </div>
        )}

        {/* ── 歷史監控概覽 ──────────────────────────────────────────────────── */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <TrendingUp size={14} color="#a78bfa" />
            <span className="text-sm font-semibold text-white">歷史監控概覽</span>
            <span className="text-[10px]" style={{ color: '#475569' }}>由排程自動更新</span>
            <div className="flex items-center gap-2 ml-auto">
              <Clock size={11} color="#64748b" />
              {lastFetchedAt ? (
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
              ) : (
                <span className="text-[10px]" style={{ color: '#475569' }}>尚未完成首次自動更新</span>
              )}
            </div>
          </div>
          {!lastFetchedAt && (
            <div className="px-3 py-2 rounded mb-3 text-xs" style={{ background: '#0f1117', border: '1px solid #2d3148', color: '#475569' }}>
              尚未完成首次自動更新，歷史摘要將在 workflow 執行後顯示。
            </div>
          )}

          {/* Symbol selector */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {watchlist.slice(0, 12).map(sym => (
              <button
                key={sym}
                onClick={() => setSelectedHistorySymbol(sym)}
                className="px-2.5 py-0.5 rounded text-xs font-semibold transition-colors"
                style={{
                  background: selectedHistorySymbol === sym ? '#1e3a5f' : '#0f1117',
                  color:      selectedHistorySymbol === sym ? '#38bdf8' : '#64748b',
                  border:     `1px solid ${selectedHistorySymbol === sym ? '#2d4a6f' : '#2d3148'}`,
                }}
              >
                {sym}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Caution summary history */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-semibold mb-1" style={{ color: '#64748b' }}>
                {selectedHistorySymbol} 綜合警戒摘要（近 7 筆）
              </div>
              {historySummaries.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: '#475569' }}>
                  尚無排程歷史摘要，請先執行自動監控更新排程。
                </p>
              ) : (
                historySummaries.map((s, i) => {
                  const sum = s.summary
                  if (!sum) return (
                    <div key={i} className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                      <div className="text-[10px]" style={{ color: '#64748b' }}>{formatHistTime(s.fetched_at)} · {s.refresh_status}</div>
                    </div>
                  )
                  const sigColor = SIG_COLOR[sum.signal_level] ?? '#64748b'
                  const sigLabel = SIG_LABEL[sum.signal_level] ?? sum.signal_level
                  return (
                    <div key={i} className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold" style={{ color: sigColor }}>{sigLabel}</span>
                        <span className="text-[10px] font-mono" style={{ color: '#64748b' }}>{sum.combined_score} / 100</span>
                      </div>
                      <div className="text-[10px] mb-1.5" style={{ color: '#64748b' }}>
                        {sum.data_coverage} · {INTERP_LABEL[sum.interpretation_status] ?? sum.interpretation_status}
                      </div>
                      <div style={{ background: '#2d3148', height: '3px', borderRadius: '2px' }}>
                        <div style={{ background: sigColor, width: `${Math.min(sum.combined_score, 100)}%`, height: '3px', borderRadius: '2px' }} />
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: '#475569' }}>
                        {formatHistTime(s.fetched_at)}
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Recent external news */}
            <div className="flex flex-col gap-2">
              <div className="text-[11px] font-semibold mb-1" style={{ color: '#64748b' }}>
                {selectedHistorySymbol} 最近外部新聞文本訊號
              </div>
              {historyNews.length === 0 ? (
                <p className="text-xs py-4 text-center" style={{ color: '#475569' }}>
                  尚無排程新聞資料，請先執行自動監控更新排程。
                </p>
              ) : (
                historyNews.map(item => {
                  const rColor = item.ai_risk_label === 'Critical' ? '#ef4444'
                    : item.ai_risk_label === 'High' ? '#f97316'
                    : item.ai_risk_label === 'Medium' ? '#f59e0b' : '#10b981'
                  return (
                    <div key={item.id} className="rounded p-2.5" style={{ background: '#0f1117', border: '1px solid #2d3148' }}>
                      <div className="flex items-center justify-between mb-1">
                        {item.ai_risk_label ? (
                          <span className="text-[10px] font-semibold" style={{ color: rColor }}>
                            文本風險語言強度：{RISK_ZH[item.ai_risk_label] ?? item.ai_risk_label}
                            {item.ai_risk_score != null ? ` · ${item.ai_risk_score}` : ''}
                          </span>
                        ) : <span />}
                        <span className="text-[10px]" style={{ color: '#475569' }}>Finnhub</span>
                      </div>
                      <div className="text-xs text-white leading-snug mb-1">
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" style={{ color: '#e2e8f0' }}>
                            {item.headline}
                          </a>
                        ) : item.headline}
                      </div>
                      <div className="text-[10px]" style={{ color: '#475569' }}>
                        {item.published_at ? formatHistTime(item.published_at) : '—'}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
