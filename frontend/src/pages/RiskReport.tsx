import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Calendar, TrendingUp, AlertTriangle, FileText } from 'lucide-react'
import { phpGet } from '../api/phpClient'
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
}

interface EventRow {
  event_date: string
  event_type: string
  title: string
  description: string
  risk_impact: string
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

  const snapshots = snapData?.snapshots ?? []
  const events    = evtData?.events    ?? []

  const chartData = [...snapshots].reverse().map((s) => ({
    date:   s.snapshot_date,
    hype:   s.social_hype_score,
    manip:  s.manipulation_signal_score,
    fomo:   s.fomo_score,
    sq:     s.short_squeeze_pressure,
  }))

  const latest = snapshots[0]

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title={`風險報告 · ${upper}`} />

      <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto w-full">

        {/* Title + latest risk */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">{upper}</h1>
            {latest && (
              <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                最新快照 {latest.snapshot_date}
                {latest.price != null && <> · ${latest.price.toLocaleString()}</>}
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
            <span className="text-sm font-semibold text-white">風險指標走勢</span>
          </div>
          {snapLoading ? (
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
            <span className="text-sm font-semibold text-white">事件時間軸</span>
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
