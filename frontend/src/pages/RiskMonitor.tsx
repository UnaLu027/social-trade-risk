import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ShieldAlert, TrendingUp, AlertTriangle, RefreshCw, Zap, Eye } from 'lucide-react'
import { phpGet } from '../api/phpClient'
import { api } from '../api/client'
import { TopBar } from '../components/layout/TopBar'

const DEFAULT_SYMBOLS = 'GME,AMC,TSLA,NVDA,AAPL,MSFT,AMD,NFLX'

// ── types ────────────────────────────────────────────────────────────────────

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

function RiskCard({ snap, onView }: { snap: RiskSnapshot; onView: () => void }) {
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

      {/* Mentions */}
      <div className="flex items-center justify-between text-xs" style={{ color: '#64748b' }}>
        <span>提及數 {snap.mention_count?.toLocaleString() ?? '—'}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onView() }}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold transition-colors"
          style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
        >
          <Eye size={10} /> 詳情
        </button>
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

  function handleSearch() {
    const val = searchTicker.trim().toUpperCase()
    if (!val) {
      setSearchError('Please enter a ticker symbol.')
      return
    }
    if (!/^[A-Z0-9.\-]+$/.test(val)) {
      setSearchError('Invalid ticker. Only A–Z, 0–9, "." and "-" are allowed.')
      return
    }
    if (val.includes('.TW')) {
      setSearchError('Only US stocks are supported in this MVP.')
      return
    }
    setSearchError('')
    navigate(`/risk-report/${val}`)
  }

  // FastAPI market snapshots (primary source)
  const {
    data: fastapiData,
    isLoading: fastapiIsLoading,
    isFetching: fastapiIsFetching,
    error: fastapiError,
    refetch: fastapiRefetch,
    dataUpdatedAt: fastapiUpdatedAt,
  } = useQuery({
    queryKey: ['fastapi-market-snapshots'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean
        count: number
        fetched_at: string
        data: { count: number; snapshots: RiskSnapshot[] }
        errors: { symbol: string; error: string }[]
      }>(`/api/v1/market-snapshots?symbols=${DEFAULT_SYMBOLS}`)
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
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchTicker}
              onChange={e => {
                const v = e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, '')
                setSearchTicker(v)
                if (searchError) setSearchError('')
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch() }}
              placeholder="Search any US ticker…"
              maxLength={10}
              className="px-3 py-2 rounded-md text-sm outline-none w-48 font-mono"
              style={{ background: '#0d0f1a', border: '1px solid #2d3148', color: '#f1f5f9' }}
            />
            <button
              onClick={handleSearch}
              className="px-3 py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
            >
              Search
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
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
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
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
