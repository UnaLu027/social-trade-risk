import type { ReactNode } from 'react'

interface StatCardProps {
  label: string
  value: string | number
  subValue?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: ReactNode
  accentColor?: string
}

export function StatCard({ label, value, subValue, trend, icon, accentColor = '#64748b' }: StatCardProps) {
  const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#64748b'

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-1"
      style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: '#64748b' }}>
          {label}
        </span>
        {icon && <span style={{ color: accentColor }}>{icon}</span>}
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color: '#f1f5f9' }}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs" style={{ color: trendColor }}>
          {subValue}
        </div>
      )}
    </div>
  )
}
