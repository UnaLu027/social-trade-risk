import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface MentionChartProps {
  data: { ts: string; mention_count: number }[]
  height?: number
}

function formatDate(ts: string) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function MentionChart({ data, height = 120 }: MentionChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 6 }}
          labelStyle={{ color: '#94a3b8', fontSize: 11 }}
          itemStyle={{ color: '#38bdf8', fontSize: 12 }}
          labelFormatter={(ts) => formatDate(String(ts))}
          formatter={(v) => [Number(v).toLocaleString(), 'Mentions']}
        />
        <Bar
          dataKey="mention_count"
          fill="#38bdf8"
          fillOpacity={0.7}
          radius={[2, 2, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
