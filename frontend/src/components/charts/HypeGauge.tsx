import { useEffect, useRef } from 'react'

const COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#ef4444',
}

function getColor(score: number): string {
  if (score >= 75) return COLORS.critical
  if (score >= 55) return COLORS.high
  if (score >= 35) return COLORS.medium
  return COLORS.low
}

interface HypeGaugeProps {
  score: number
  label: string
  size?: number
}

export function HypeGauge({ score, label, size = 140 }: HypeGaugeProps) {
  const color = getColor(score)
  const angle = -135 + (score / 100) * 270
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
  const strokeWidth = size * 0.07

  const polarToCartesian = (angleDeg: number) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
  }

  const describeArc = (startAngle: number, endAngle: number) => {
    const start = polarToCartesian(endAngle)
    const end = polarToCartesian(startAngle)
    const large = endAngle - startAngle <= 180 ? '0' : '1'
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 0 ${end.x} ${end.y}`
  }

  const needleEnd = polarToCartesian(angle)
  const pulseClass = score >= 75 ? 'animate-pulse-glow' : ''

  return (
    <div className={`flex flex-col items-center ${pulseClass}`}>
      <svg width={size} height={size * 0.72} viewBox={`0 0 ${size} ${size * 0.72}`}>
        {/* Track */}
        <path
          d={describeArc(-135, 135)}
          fill="none"
          stroke="#1f2235"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Fill */}
        <path
          d={describeArc(-135, angle)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          style={{ transition: 'all 0.8s ease-out', filter: `drop-shadow(0 0 4px ${color}60)` }}
        />
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={needleEnd.x} y2={needleEnd.y}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          style={{ transition: 'all 0.8s ease-out' }}
        />
        <circle cx={cx} cy={cy} r={3} fill={color} />
        {/* Score label */}
        <text
          x={cx} y={cy - r * 0.1}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="white"
          fontSize={size * 0.18}
          fontWeight="700"
          fontFamily="Inter, sans-serif"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {score.toFixed(0)}
        </text>
        <text
          x={cx} y={cy + r * 0.28}
          textAnchor="middle"
          fill="#64748b"
          fontSize={size * 0.08}
          fontFamily="Inter, sans-serif"
        >
          / 100
        </text>
      </svg>
      <span
        className="text-xs font-semibold uppercase tracking-wider mt-1 px-2 py-0.5 rounded"
        style={{
          color,
          background: color + '18',
          border: `1px solid ${color}30`,
        }}
      >
        {label}
      </span>
    </div>
  )
}
