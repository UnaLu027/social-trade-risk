interface SentimentBarProps {
  bullishRatio: number
  size?: 'sm' | 'md'
}

export function SentimentBar({ bullishRatio, size = 'md' }: SentimentBarProps) {
  const bearish = 1 - bullishRatio
  const neutral = Math.max(0, bullishRatio - 0.5) * 0.3
  const h = size === 'sm' ? 'h-2' : 'h-3'

  return (
    <div>
      <div className={`flex rounded-full overflow-hidden gap-0.5 ${h}`} style={{ background: '#1f2235' }}>
        <div
          className="transition-all duration-700"
          style={{ width: `${bullishRatio * 100}%`, background: '#10b981' }}
        />
        <div
          className="transition-all duration-700"
          style={{ width: `${bearish * 100}%`, background: '#ef4444' }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] font-medium" style={{ color: '#10b981' }}>
          看漲 {(bullishRatio * 100).toFixed(0)}%
        </span>
        <span className="text-[10px] font-medium" style={{ color: '#ef4444' }}>
          看跌 {(bearish * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  )
}
