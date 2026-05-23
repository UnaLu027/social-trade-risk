import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, ChevronDown, ChevronRight } from 'lucide-react'
import { getAlerts, markAlertRead, getWatchlist, addToWatchlist, removeFromWatchlist } from '../api/alerts'
import { TopBar } from '../components/layout/TopBar'
import { AlertBadge } from '../components/cards/AlertBadge'
import type { AlertResponse } from '../types/api'

const SEVERITY_FILTER = [
  { value: 'all', label: '全部' },
  { value: 'critical', label: '嚴重' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

export function AlertCenter() {
  const [severityFilter, setSeverityFilter] = useState('all')
  const [showUnreadOnly, setShowUnreadOnly] = useState(false)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [newSymbol, setNewSymbol] = useState('')
  const qc = useQueryClient()

  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ['alerts', severityFilter, showUnreadOnly],
    queryFn: () => getAlerts({
      severity: severityFilter === 'all' ? undefined : severityFilter,
      is_read: showUnreadOnly ? false : undefined,
    }),
    refetchInterval: 60_000,
  })

  const { data: watchlist } = useQuery({
    queryKey: ['watchlist'],
    queryFn: getWatchlist,
    refetchInterval: 60_000,
  })

  const addMut = useMutation({
    mutationFn: addToWatchlist,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['watchlist'] }); setNewSymbol('') },
  })

  const removeMut = useMutation({
    mutationFn: removeFromWatchlist,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  })

  const readMut = useMutation({
    mutationFn: markAlertRead,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="警報中心" />

      <div className="flex flex-1 overflow-hidden">
        {/* Watchlist sidebar */}
        <div
          className="w-52 flex-shrink-0 p-4 flex flex-col gap-3 overflow-y-auto"
          style={{ borderRight: '1px solid #1f2235' }}
        >
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
            自選清單
          </span>
          {watchlist?.map((item) => (
            <div
              key={item.symbol}
              className="flex items-center justify-between p-2 rounded-lg"
              style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
            >
              <div>
                <div className="text-sm font-semibold text-white">{item.symbol}</div>
                {item.hype_score !== null && (
                  <div
                    className="text-[10px]"
                    style={{ color: item.hype_score > 70 ? '#ef4444' : item.hype_score > 45 ? '#f59e0b' : '#10b981' }}
                  >
                    炒作 {item.hype_score.toFixed(0)}
                  </div>
                )}
              </div>
              <button onClick={() => removeMut.mutate(item.symbol)} style={{ color: '#3d4163' }}>
                <X size={12} />
              </button>
            </div>
          ))}

          {/* Add ticker */}
          <div className="flex gap-1 mt-1">
            <input
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              placeholder="TICKER"
              maxLength={6}
              className="flex-1 text-xs px-2 py-1.5 rounded"
              style={{ background: '#131627', border: '1px solid #2d3148', color: '#f1f5f9' }}
              onKeyDown={(e) => e.key === 'Enter' && newSymbol && addMut.mutate(newSymbol)}
            />
            <button
              onClick={() => newSymbol && addMut.mutate(newSymbol)}
              className="px-2 py-1.5 rounded text-xs"
              style={{ background: '#10b98120', border: '1px solid #10b98140', color: '#10b981' }}
            >
              <Plus size={12} />
            </button>
          </div>
        </div>

        {/* Alert feed */}
        <div className="flex-1 p-5 overflow-y-auto">
          {/* Filters */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {SEVERITY_FILTER.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setSeverityFilter(value)}
                className="text-xs px-3 py-1 rounded-full transition-colors"
                style={{
                  background: severityFilter === value ? '#222536' : 'transparent',
                  border: `1px solid ${severityFilter === value ? '#2d3148' : '#1f2235'}`,
                  color: severityFilter === value ? '#f1f5f9' : '#64748b',
                }}
              >
                {label}
              </button>
            ))}
            <button
              onClick={() => setShowUnreadOnly(!showUnreadOnly)}
              className="text-xs px-3 py-1 rounded-full transition-colors ml-auto"
              style={{
                background: showUnreadOnly ? '#222536' : 'transparent',
                border: `1px solid ${showUnreadOnly ? '#10b98140' : '#1f2235'}`,
                color: showUnreadOnly ? '#10b981' : '#64748b',
              }}
            >
              僅顯示未讀
            </button>
          </div>

          {/* Alert rows */}
          {alertsLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg mb-2 animate-pulse" style={{ background: '#1a1d27' }} />
            ))
          ) : alerts?.length === 0 ? (
            <div className="text-center py-16" style={{ color: '#3d4163' }}>
              <p className="text-sm">無符合條件的警報</p>
              <p className="text-xs mt-1">請啟動後端並匯入資料以產生警報</p>
            </div>
          ) : (
            alerts?.map((alert: AlertResponse) => (
              <div
                key={alert.id}
                className="mb-2 rounded-lg overflow-hidden"
                style={{
                  background: '#1a1d27',
                  border: `1px solid ${alert.is_read ? '#2d3148' : alert.severity === 'critical' ? '#7f1d1d' : '#2d3148'}`,
                  opacity: alert.is_read ? 0.65 : 1,
                }}
              >
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                >
                  {!alert.is_read && (
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#ef4444' }} />
                  )}
                  <AlertBadge severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{alert.message}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>
                      {alert.ticker} · {new Date(alert.ts).toLocaleString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  {alert.hype_score !== null && (
                    <span className="text-xs font-mono tabular-nums" style={{ color: '#f59e0b' }}>
                      {alert.hype_score.toFixed(0)}
                    </span>
                  )}
                  {expandedId === alert.id ? <ChevronDown size={12} color="#64748b" /> : <ChevronRight size={12} color="#64748b" />}
                </div>

                {expandedId === alert.id && (
                  <div className="px-4 pb-3 pt-0">
                    <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                      {alert.trigger_explanation}
                    </p>
                    {!alert.is_read && (
                      <button
                        onClick={() => readMut.mutate(alert.id)}
                        className="mt-2 text-xs px-3 py-1 rounded"
                        style={{ background: '#222536', border: '1px solid #2d3148', color: '#64748b' }}
                      >
                        標記為已讀
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
