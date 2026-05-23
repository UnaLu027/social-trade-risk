import { useAppStore } from '../../store/useAppStore'
import { Bell, Search, RefreshCw } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

const TICKERS = ['GME', 'AMC', 'BBBY']

export function TopBar({ title }: { title: string }) {
  const { activeTicker, setActiveTicker } = useAppStore()
  const qc = useQueryClient()

  return (
    <header
      className="h-14 flex items-center justify-between px-6 flex-shrink-0 sticky top-0 z-20"
      style={{ background: '#0d0f1a', borderBottom: '1px solid #1f2235' }}
    >
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold text-white">{title}</span>
        <div className="flex items-center gap-1">
          {TICKERS.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTicker(t)}
              className="px-3 py-1 text-xs font-semibold rounded transition-colors"
              style={{
                background: activeTicker === t ? '#1e2235' : 'transparent',
                color: activeTicker === t ? '#10b981' : '#64748b',
                border: `1px solid ${activeTicker === t ? '#2d3148' : 'transparent'}`,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs"
          style={{ background: '#1a1d27', border: '1px solid #2d3148', color: '#64748b' }}
        >
          <Search size={12} />
          <span>搜尋代號…</span>
        </div>
        <button
          onClick={() => qc.invalidateQueries()}
          className="p-1.5 rounded-md transition-colors"
          style={{ color: '#64748b' }}
          title="重新整理"
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="p-1.5 rounded-md relative transition-colors"
          style={{ color: '#64748b' }}
          title="警報"
        >
          <Bell size={14} />
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
            style={{ background: '#ef4444' }}
          />
        </button>
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold"
          style={{ background: '#2d3148', color: '#10b981' }}
        >
          A
        </div>
      </div>
    </header>
  )
}
