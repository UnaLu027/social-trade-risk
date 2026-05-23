import type { ScenarioRequest } from '../../types/api'

interface SliderConfig {
  key: keyof ScenarioRequest
  label: string
  min: number
  max: number
  step: number
  unit: string
  description: string
}

const SLIDERS: SliderConfig[] = [
  { key: 'mention_growth', label: '提及成長率', min: 0, max: 10, step: 0.1, unit: '×', description: '與前一小時相比的社群提及成長比率' },
  { key: 'bullish_ratio', label: '看漲比率', min: 0, max: 1, step: 0.01, unit: '', description: '看漲提及佔總提及數的比例' },
  { key: 'short_interest', label: '放空比率', min: 0, max: 1, step: 0.01, unit: '', description: '預估的放空流通比率' },
  { key: 'option_activity', label: '選擇權活動', min: 0, max: 5, step: 0.1, unit: '×', description: '選擇權成交量對比 20 日均量' },
  { key: 'influencer_activity', label: '網紅活躍度', min: 0, max: 1, step: 0.01, unit: '', description: '網紅發文互動分數（0–1）' },
  { key: 'hype_score', label: '炒作分數覆蓋', min: 0, max: 100, step: 1, unit: '/100', description: '手動設定炒作分數以進行模擬' },
]

interface SliderPanelProps {
  values: ScenarioRequest
  onChange: (key: keyof ScenarioRequest, value: number | boolean) => void
}

export function SliderPanel({ values, onChange }: SliderPanelProps) {
  return (
    <div className="flex flex-col gap-5">
      {SLIDERS.map(({ key, label, min, max, step, unit, description }) => {
        const val = values[key] as number
        const pct = ((val - min) / (max - min)) * 100

        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium" style={{ color: '#94a3b8' }}>{label}</span>
              <span
                className="text-sm font-bold tabular-nums"
                style={{ color: pct > 70 ? '#ef4444' : pct > 40 ? '#f59e0b' : '#10b981' }}
              >
                {typeof val === 'number' ? (step < 0.1 ? (val * 100).toFixed(0) + '%' : val.toFixed(1) + unit) : String(val)}
              </span>
            </div>
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={val}
              onChange={(e) => onChange(key, parseFloat(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, ${pct > 70 ? '#ef4444' : pct > 40 ? '#f59e0b' : '#10b981'} ${pct}%, #2d3148 ${pct}%)`,
                outline: 'none',
              }}
            />
            <p className="text-[10px] mt-1" style={{ color: '#3d4163' }}>{description}</p>
          </div>
        )
      })}

      {/* Trading restriction toggle */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <div className="text-xs font-medium" style={{ color: '#94a3b8' }}>交易限制</div>
          <div className="text-[10px] mt-0.5" style={{ color: '#3d4163' }}>模擬暫停交易 / 交易限制</div>
        </div>
        <button
          onClick={() => onChange('trading_restriction', !values.trading_restriction)}
          className="w-10 h-5 rounded-full relative transition-colors"
          style={{ background: values.trading_restriction ? '#ef4444' : '#2d3148' }}
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
            style={{
              background: 'white',
              left: values.trading_restriction ? 'calc(100% - 18px)' : '2px',
            }}
          />
        </button>
      </div>
    </div>
  )
}
