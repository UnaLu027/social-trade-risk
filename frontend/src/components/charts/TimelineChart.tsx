import {
  ComposedChart, Area, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from 'recharts'
import type { TimelinePoint, EventMarker } from '../../types/api'

const EVENT_COLORS: Record<string, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#38bdf8',
}

interface TimelineChartProps {
  data: TimelinePoint[]
  eventMarkers: EventMarker[]
  onEventClick?: (marker: EventMarker) => void
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function TimelineChart({ data, eventMarkers, onEventClick }: TimelineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="priceGradTimeline" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2235" vertical={false} />
        <XAxis
          dataKey="ts"
          tickFormatter={formatDate}
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="price"
          orientation="left"
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={60}
          tickFormatter={(v: number) => `$${v.toFixed(0)}`}
        />
        <YAxis
          yAxisId="hype"
          orientation="right"
          domain={[0, 100]}
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(v: number) => `${v}`}
        />
        <YAxis
          yAxisId="mentions"
          orientation="right"
          tick={false}
          axisLine={false}
          width={0}
        />

        {/* Event reference lines */}
        {eventMarkers.map((m, i) => (
          <ReferenceLine
            key={i}
            x={m.ts}
            yAxisId="price"
            stroke={EVENT_COLORS[m.type] || '#64748b'}
            strokeDasharray="4 3"
            strokeWidth={1.5}
            label={{
              value: m.label.substring(0, 15),
              fill: EVENT_COLORS[m.type] || '#64748b',
              fontSize: 9,
              position: 'top',
            }}
          />
        ))}

        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          labelFormatter={(ts) => formatDate(String(ts))}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 8 }}
        />

        <Area
          yAxisId="price"
          type="monotone"
          dataKey="close"
          name="Price ($)"
          stroke="#10b981"
          strokeWidth={1.5}
          fill="url(#priceGradTimeline)"
          dot={false}
        />
        <Bar
          yAxisId="mentions"
          dataKey="mention_count"
          name="Mentions"
          fill="#38bdf8"
          fillOpacity={0.4}
          radius={[1, 1, 0, 0]}
        />
        <Line
          yAxisId="hype"
          type="monotone"
          dataKey="hype_score"
          name="Hype Score"
          stroke="#f59e0b"
          strokeWidth={2}
          dot={false}
          strokeDasharray="5 3"
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
