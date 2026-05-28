import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Calendar, TrendingUp, AlertTriangle, FileText, Newspaper, ExternalLink } from 'lucide-react'
import { phpGet } from '../api/phpClient'
import { api } from '../api/client'
import { TopBar } from '../components/layout/TopBar'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

// ── types ────────────────────────────────────────────────────────────────────

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

// ── main page ─────────────────────────────────────────────────────────────────

export function RiskReport() {
  const { symbol = 'GME' } = useParams<{ symbol: string }>()
  const upper = symbol.toUpperCase()

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

  // FastAPI market snapshot (primary — latest single-point data)
  const { data: fastapiData, isLoading: fastapiLoading } = useQuery({
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

  const { data: signalsData, isLoading: signalsLoading } = useQuery({
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

  const { data: histData, isLoading: histLoading } = useQuery({
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

  const snapshots = snapData?.snapshots ?? []
  const events    = evtData?.events    ?? []

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

  // FastAPI provides today's snapshot; PHP provides historical archive
  const fastapiSnapshot  = fastapiData?.data?.snapshots?.[0] ?? null
  const hasFastapi       = !!fastapiSnapshot
  // Use the most recent PHP snapshot (last item, since PHP returns ASC order)
  const phpLatest        = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
  const latest           = fastapiSnapshot ?? phpLatest ?? null
  const usingPhpFallback = !hasFastapi && !!phpLatest

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title={`風險報告 · ${upper}`} />

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
                    Latest market snapshot · Rule-based market data
                  </span>
                ) : (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: '#1c1a05', color: '#f59e0b', border: '1px solid #78350f' }}
                  >
                    Historical archive
                  </span>
                )}
                <span className="text-xs" style={{ color: '#64748b' }}>
                  {latest.snapshot_date}
                  {latest.price != null && <> · ${latest.price.toLocaleString()}</>}
                </span>
              </div>
            )}
          </div>
          {latest?.ai_risk_label && (
            <span
              className="text-sm font-bold px-3 py-1 rounded-full"
              style={{ background: riskColor(latest.ai_risk_label) + '22', color: riskColor(latest.ai_risk_label), border: `1px solid ${riskColor(latest.ai_risk_label)}` }}
            >
              {latest.ai_risk_label} Risk
            </span>
          )}
        </div>

        {/* Risk trend chart */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={14} color="#38bdf8" />
            <span className="text-sm font-semibold text-white">Recent market risk trend</span>
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
              Historical archive fallback: recent market-history data is temporarily unavailable.
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

        {/* Event timeline */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={14} color="#10b981" />
            <span className="text-sm font-semibold text-white">Historical event archive</span>
          </div>
          {evtLoading ? (
            <div className="h-24 animate-pulse rounded" style={{ background: '#2d3148' }} />
          ) : events.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#64748b' }}>無事件記錄</p>
          ) : (
            <div className="flex flex-col gap-0">
              {events.map((evt, i) => (
                <div key={i} className="flex gap-3">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
                         style={{ background: riskColor(evt.risk_impact), border: `2px solid ${riskColor(evt.risk_impact)}` }} />
                    {i < events.length - 1 && (
                      <div className="w-px flex-1 mt-0.5" style={{ background: '#2d3148', minHeight: 20 }} />
                    )}
                  </div>
                  {/* Content */}
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

        {/* Latest external signals */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Newspaper size={14} color="#f59e0b" />
              <span className="text-sm font-semibold text-white">Latest external signals</span>
            </div>
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: '#052e16', color: '#10b981', border: '1px solid #065f46' }}
            >
              live_social_signals
            </span>
          </div>
          {signalsLoading ? (
            <div className="h-24 animate-pulse rounded" style={{ background: '#2d3148' }} />
          ) : signalItems.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#64748b' }}>
              Latest external signals temporarily unavailable
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
                            color: riskColor(item.ai_risk_label),
                            border: `1px solid ${riskColor(item.ai_risk_label)}55`,
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

        {/* GME narrative (shown for GME; generic note for others) */}
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
