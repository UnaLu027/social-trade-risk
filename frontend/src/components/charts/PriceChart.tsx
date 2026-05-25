import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { PricePoint } from '../../types/api'

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
}

interface PriceChartProps {
  data: PricePoint[]
  positive?: boolean
  currency?: string
}

export function PriceChart({ data, positive = true, currency = 'USD' }: PriceChartProps) {
  const color = positive ? '#10b981' : '#ef4444'
  const isTwd = currency === 'TWD'
  const fmtPrice = (v: number) => isTwd ? `NT$${v.toFixed(0)}` : `$${v.toFixed(2)}`
  const fmtAxis  = (v: number) => isTwd ? `NT$${v.toFixed(0)}` : `$${v.toFixed(0)}`

  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2235" vertical={false} />
        <XAxis
          dataKey="ts"
          tickFormatter={formatTime}
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={['auto', 'auto']}
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={isTwd ? 68 : 55}
          tickFormatter={fmtAxis}
        />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ color: color, fontSize: 12 }}
          formatter={(v) => [fmtPrice(Number(v)), '股價']}
          labelFormatter={(ts) => formatTime(String(ts))}
        />
        <Area
          type="monotone"
          dataKey="close"
          stroke={color}
          strokeWidth={1.5}
          fill="url(#priceGrad)"
          dot={false}
          activeDot={{ r: 3, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
