import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart3, LayoutDashboard, TrendingUp, RefreshCw } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getScreener } from '../api/screener'
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

export function MarketOverview() {
  const { setActiveTicker } = useAppStore()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'all' | 'us' | 'tw'>('all')

  const { data: screenerData, isLoading: screenerLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['screener'],
    queryFn: getScreener,
    refetchInterval: 5 * 60_000,   // 每 5 分鐘自動更新
    staleTime: 4 * 60_000,
    retry: 1,
  })

  const filteredItems = useMemo(() => {
    if (!screenerData) return []
    if (activeTab === 'us') return screenerData.filter(i => !i.symbol.endsWith('.TW'))
    if (activeTab === 'tw') return screenerData.filter(i => i.symbol.endsWith('.TW'))
    return screenerData
  }, [screenerData, activeTab])

  const bullishTop5 = useMemo(() => {
    if (!screenerData) return []
    return screenerData
      .filter(i => (i.price_change_pct ?? 0) > 0)
      .sort((a, b) => (b.price_change_pct ?? 0) - (a.price_change_pct ?? 0))
      .slice(0, 5)
  }, [screenerData])

  function handleViewTicker(symbol: string) {
    setActiveTicker(symbol)
    navigate('/market-pulse')
  }

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="市場總覽" />

      <div className="p-6 flex flex-col gap-6">
        {/* Bullish Leaderboard */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp size={14} color="#10b981" />
            <span className="text-sm font-semibold text-white">看漲排行榜</span>
            <span className="text-xs ml-1" style={{ color: '#64748b' }}>漲幅前 5 強</span>
          </div>
          <div className="text-xs mb-3" style={{ color: '#64748b' }}>
            依漲幅排序，顯示正報酬標的
          </div>

          {screenerLoading ? (
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 w-44 rounded-lg animate-pulse"
                  style={{ background: '#2d3148' }}
                />
              ))}
            </div>
          ) : bullishTop5.length === 0 ? (
            <div className="text-xs py-4 text-center" style={{ color: '#64748b' }}>
              目前無正報酬標的
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {bullishTop5.map((item, rank) => (
                <button
                  key={item.symbol}
                  onClick={() => handleViewTicker(item.symbol)}
                  className="flex flex-col gap-1.5 px-4 py-3 rounded-lg text-left transition-opacity hover:opacity-80"
                  style={{
                    background: '#0f1a1f',
                    border: '1px solid #1a3a2a',
                    minWidth: 160,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: rank === 0 ? '#10b981' : '#1a3a2a', color: rank === 0 ? '#fff' : '#10b981' }}
                    >
                      {rank + 1}
                    </span>
                    <span className="text-sm font-semibold text-white">{item.symbol}</span>
                    <span
                      className="text-xs font-mono font-bold ml-auto"
                      style={{ color: '#10b981' }}
                    >
                      ▲ {item.price_change_pct!.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-2 justify-between">
                    <HypeBar score={item.hype_score} />
                    <MlRiskBadge label={item.ml_risk_label} text={item.ml_risk_text} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Screener Table with Tabs */}
        <div className="rounded-lg overflow-hidden" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          {/* Table header + tabs */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-wrap"
            style={{ borderBottom: '1px solid #2d3148' }}
          >
            <BarChart3 size={14} color="#38bdf8" />
            <span className="text-sm font-semibold text-white">市場篩選器</span>
            <span className="text-xs" style={{ color: '#64748b' }}>
              {filteredItems.length > 0 ? `${filteredItems.length} 個標的` : ''}
            </span>

            {/* Update status (pushed to right with ml-auto) */}
            <div className="flex items-center gap-2 mr-2 ml-auto">
              {isFetching ? (
                <span className="text-xs flex items-center gap-1" style={{ color: '#38bdf8' }}>
                  <RefreshCw size={10} className="animate-spin" /> 更新中…
                </span>
              ) : dataUpdatedAt > 0 ? (
                <span className="text-xs" style={{ color: '#64748b' }}>
                  最後更新 {new Date(dataUpdatedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              ) : null}
              <button
                onClick={() => refetch()}
                disabled={isFetching}
                className="p-1 rounded transition-opacity"
                style={{ color: '#38bdf8', opacity: isFetching ? 0.4 : 1 }}
                title="立即重新整理"
              >
                <RefreshCw size={11} />
              </button>
            </div>

            {/* Tab pill group */}
            <div
              className="flex items-center rounded-md overflow-hidden text-xs font-semibold"
              style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}
            >
              {(
                [
                  { key: 'all', label: '全部' },
                  { key: 'us', label: '美股' },
                  { key: 'tw', label: '台股' },
                ] as const
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className="px-3 py-1.5 transition-colors"
                  style={
                    activeTab === key
                      ? { background: '#1e3a5f', color: '#38bdf8' }
                      : { background: 'transparent', color: '#64748b' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
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
                  : filteredItems.map((item) => {
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
                              {item.price != null
                                ? item.currency === 'TWD'
                                  ? `NT$${item.price.toFixed(0)}`
                                  : `$${item.price.toFixed(2)}`
                                : '—'}
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
