import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getScreener, getTrending } from '../api/screener'
import { TopBar } from '../components/layout/TopBar'

function HypeBar({ score }: { score: number | null }) {
  if (score === null) return <span style={{ color: '#64748b' }}>—</span>
  const pct = Math.min(100, Math.max(0, score))
  const color = pct >= 70 ? '#ef4444' : pct >= 40 ? '#f59e0b' : '#10b981'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-20 rounded-full" style={{ background: '#2d3148' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums" style={{ color }}>{pct.toFixed(0)}</span>
    </div>
  )
}

function MlRiskBadge({ label }: { label: number | null; text?: string }) {
  if (label === null) return <span style={{ color: '#64748b' }}>—</span>
  const configs = [
    { text: '低', color: '#10b981', bg: '#052e16' },
    { text: '中', color: '#f59e0b', bg: '#451a03' },
    { text: '高', color: '#ef4444', bg: '#450a0a' },
  ]
  const cfg = configs[label] ?? configs[0]
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}33` }}
    >
      {cfg.text}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded animate-pulse" style={{ background: '#2d3148', width: i === 0 ? 80 : 60 }} />
        </td>
      ))}
    </tr>
  )
}

export function MarketScreener() {
  const { setActiveTicker } = useAppStore()
  const navigate = useNavigate()

  const { data: screenerData, isLoading: screenerLoading } = useQuery({
    queryKey: ['screener'],
    queryFn: getScreener,
    refetchInterval: 60_000,
    staleTime: 55_000,
    retry: 1,
  })

  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ['trending'],
    queryFn: getTrending,
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
    retry: 1,
  })

  function handleViewTicker(symbol: string) {
    setActiveTicker(symbol)
    navigate('/market-pulse')
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="市場篩選器" />

      <div className="p-6 flex flex-col gap-6">
        {/* Trending Detection */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ background: '#10b981', display: 'inline-block' }}
            />
            <span className="text-sm font-semibold text-white">熱門偵測</span>
          </div>
          <div className="text-xs mb-3" style={{ color: '#64748b' }}>
            自動偵測 Reddit 熱門股票
          </div>
          <div className="flex flex-wrap gap-2">
            {trendingLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-7 w-20 rounded-full animate-pulse"
                    style={{ background: '#2d3148' }}
                  />
                ))
              : (trendingData ?? []).slice(0, 8).map((t) => {
                  const sentColor = t.avg_sentiment > 0 ? '#10b981' : '#ef4444'
                  return (
                    <button
                      key={t.symbol}
                      onClick={() => handleViewTicker(t.symbol)}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-opacity hover:opacity-80"
                      style={{
                        background: '#222536',
                        border: '1px solid #2d3148',
                        color: '#f1f5f9',
                      }}
                    >
                      <span>{t.symbol}</span>
                      <span style={{ color: '#64748b' }}>{t.mention_count}</span>
                      <span style={{ color: sentColor }}>{t.avg_sentiment > 0 ? '▲' : '▼'}</span>
                    </button>
                  )
                })}
          </div>
        </div>

        {/* Screener Table */}
        <div className="rounded-lg overflow-hidden" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid #2d3148' }}>
            <BarChart3 size={14} color="#38bdf8" />
            <span className="text-sm font-semibold text-white">市場篩選器</span>
            <span className="text-xs ml-1" style={{ color: '#64748b' }}>
              {screenerData ? `${screenerData.length} 個標的` : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid #2d3148' }}>
                  {['代號 / 名稱', '炒作分數', 'ML 風險', '股價 + 漲跌幅', '成交量倍數', '24H 提及數', '操作'].map(
                    (col) => (
                      <th
                        key={col}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: '#64748b' }}
                      >
                        {col}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {screenerLoading
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                  : (screenerData ?? []).map((item) => {
                      const isPos = (item.price_change_pct ?? 0) >= 0
                      return (
                        <tr
                          key={item.symbol}
                          className="cursor-pointer transition-colors"
                          style={{ borderBottom: '1px solid #1f2235' }}
                          onClick={() => handleViewTicker(item.symbol)}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLTableRowElement).style.background = '#1e2235')
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLTableRowElement).style.background = 'transparent')
                          }
                        >
                          {/* Symbol / Name */}
                          <td className="px-4 py-3">
                            <div className="font-semibold text-white">{item.symbol}</div>
                            <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                              {item.name}
                            </div>
                          </td>

                          {/* Hype bar */}
                          <td className="px-4 py-3">
                            <HypeBar score={item.hype_score} />
                          </td>

                          {/* ML risk */}
                          <td className="px-4 py-3">
                            <MlRiskBadge label={item.ml_risk_label} text={item.ml_risk_text} />
                          </td>

                          {/* Price + change */}
                          <td className="px-4 py-3">
                            <div className="font-mono text-white">
                              {item.price != null ? `$${item.price.toFixed(2)}` : '—'}
                            </div>
                            {item.price_change_pct != null && (
                              <div
                                className="text-xs font-mono mt-0.5"
                                style={{ color: isPos ? '#10b981' : '#ef4444' }}
                              >
                                {isPos ? '▲' : '▼'} {Math.abs(item.price_change_pct).toFixed(2)}%
                              </div>
                            )}
                          </td>

                          {/* Volume spike */}
                          <td className="px-4 py-3 font-mono text-xs" style={{ color: '#38bdf8' }}>
                            {item.volume_spike != null ? `${item.volume_spike.toFixed(1)}×` : '—'}
                          </td>

                          {/* 24H mentions */}
                          <td className="px-4 py-3 font-mono text-xs" style={{ color: '#94a3b8' }}>
                            {item.mention_count_24h.toLocaleString()}
                          </td>

                          {/* Action */}
                          <td className="px-4 py-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleViewTicker(item.symbol)
                              }}
                              className="px-3 py-1 rounded text-xs font-semibold transition-colors"
                              style={{
                                background: '#1e3a5f',
                                color: '#38bdf8',
                                border: '1px solid #2d4a6f',
                              }}
                              onMouseEnter={(e) =>
                                ((e.currentTarget as HTMLButtonElement).style.background = '#234471')
                              }
                              onMouseLeave={(e) =>
                                ((e.currentTarget as HTMLButtonElement).style.background = '#1e3a5f')
                              }
                            >
                              查看
                            </button>
                          </td>
                        </tr>
                      )
                    })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
