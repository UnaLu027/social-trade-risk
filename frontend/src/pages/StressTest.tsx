import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FlaskConical, Save, AlertTriangle } from 'lucide-react'
import { api } from '../api/client'
import { phpPost } from '../api/phpClient'
import { TopBar } from '../components/layout/TopBar'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'

// ── types ────────────────────────────────────────────────────────────────────

interface SimInput {
  mention_growth:       number   // 0-1
  influencer_power:     number   // 0-1
  fanatic_ratio:        number   // 0-1
  short_interest:       number   // 0-1 (e.g. 1.4 = 140%)
  volume_spike:         number   // 0-1
  trading_restriction:  boolean
  rational_investor_ratio: number // 0-1
}

interface SimOutput {
  simulated_risk_score: number
  simulated_risk_label: 'Critical' | 'High' | 'Medium' | 'Low'
  belief_curve?: number[]
  price_curve?: number[]
  key_drivers: string[]
  explanation: string
}

// ── local simulation fallback ────────────────────────────────────────────────

function localSimulate(p: SimInput): SimOutput {
  const base =
    p.mention_growth      * 25 +
    p.influencer_power    * 20 +
    p.fanatic_ratio       * 20 +
    p.short_interest      * 20 +
    p.volume_spike        * 10 +
    (p.trading_restriction ? 5 : 0) -
    p.rational_investor_ratio * 10

  const score = Math.min(100, Math.max(0, base))
  const label: SimOutput['simulated_risk_label'] =
    score >= 75 ? 'Critical' :
    score >= 50 ? 'High' :
    score >= 25 ? 'Medium' : 'Low'

  // Simplified belief diffusion curve (20 steps)
  const beliefCurve = Array.from({ length: 20 }, (_, t) => {
    const spread = 1 / (1 + Math.exp(-0.5 * (t - 8 + (1 - p.fanatic_ratio) * 4)))
    return Math.min(1, spread * p.influencer_power * p.mention_growth)
  })

  const priceCurve = Array.from({ length: 20 }, (_, t) => {
    const momentum = beliefCurve[t] * p.short_interest * 200
    const correction = t > 12 ? -(t - 12) * 8 : 0
    return Math.max(10, 50 + momentum + correction + (p.trading_restriction && t === 8 ? -30 : 0))
  })

  const drivers = [
    p.mention_growth     > 0.6 ? '高提及成長率'       : null,
    p.influencer_power   > 0.6 ? '意見領袖放大效應'   : null,
    p.fanatic_ratio      > 0.6 ? '狂熱散戶比例高'     : null,
    p.short_interest     > 0.6 ? '高空頭利息風險'     : null,
    p.volume_spike       > 0.6 ? '成交量異常激增'     : null,
    p.trading_restriction       ? '交易限制觸發反彈'  : null,
  ].filter(Boolean) as string[]

  return {
    simulated_risk_score: score,
    simulated_risk_label: label,
    belief_curve:  beliefCurve,
    price_curve:   priceCurve,
    key_drivers:   drivers,
    explanation: `模擬風險分數 ${score.toFixed(1)}，判定為 ${label}。${drivers.length > 0 ? '主要驅動因素：' + drivers.join('、') + '。' : ''}`,
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const RISK_COLOR = { Critical: '#ef4444', High: '#f97316', Medium: '#f59e0b', Low: '#10b981' }
const RISK_BG    = { Critical: '#450a0a', High: '#431407', Medium: '#451a03', Low: '#052e16' }

interface SliderProps {
  label: string
  hint: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  pct?: boolean
}

function Slider({ label, hint, value, onChange, min = 0, max = 1, step = 0.05, pct = true }: SliderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-xs">
        <div>
          <span className="font-semibold text-white">{label}</span>
          <span className="ml-2" style={{ color: '#64748b' }}>{hint}</span>
        </div>
        <span className="font-mono font-semibold" style={{ color: '#38bdf8' }}>
          {pct ? `${(value * 100).toFixed(0)}%` : value.toFixed(2)}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-400 cursor-pointer"
      />
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export function StressTest() {
  const [inputs, setInputs] = useState<SimInput>({
    mention_growth:         0.5,
    influencer_power:       0.5,
    fanatic_ratio:          0.4,
    short_interest:         0.6,
    volume_spike:           0.4,
    trading_restriction:    false,
    rational_investor_ratio: 0.5,
  })
  const [result, setResult]   = useState<SimOutput | null>(null)
  const [savedId, setSavedId] = useState<number | null>(null)
  const [fromApi, setFromApi] = useState(false)

  const set = (key: keyof SimInput) => (v: number | boolean) =>
    setInputs(prev => ({ ...prev, [key]: v }))

  const runMutation = useMutation({
    mutationFn: async (inp: SimInput): Promise<SimOutput> => {
      try {
        const res = await api.post<SimOutput>('/api/v1/stress-test', inp)
        setFromApi(true)
        return res.data
      } catch {
        setFromApi(false)
        return localSimulate(inp)
      }
    },
    onSuccess: async (data) => {
      setResult(data)
      try {
        const saved = await phpPost<{ id: number }>('/save_simulation.php', {
          ...inputs,
          trading_restriction:   inputs.trading_restriction ? 1 : 0,
          simulated_risk_score:  data.simulated_risk_score,
          simulated_risk_label:  data.simulated_risk_label,
          explanation:           data.explanation,
        })
        setSavedId(saved.id)
      } catch {
        // optional
      }
    },
  })

  const rColor = result ? (RISK_COLOR[result.simulated_risk_label] ?? '#10b981') : '#64748b'
  const rBg    = result ? (RISK_BG[result.simulated_risk_label]    ?? '#1a1d27') : '#1a1d27'

  const beliefChart = result?.belief_curve?.map((v, i) => ({ t: i, belief: +(v * 100).toFixed(1) })) ?? []
  const priceChart  = result?.price_curve?.map((v, i)  => ({ t: i, price:  +v.toFixed(1)         })) ?? []

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="情境壓力測試" />

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-6xl mx-auto w-full">

        {/* Input panel */}
        <div className="rounded-lg p-5 flex flex-col gap-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2">
            <FlaskConical size={16} color="#a78bfa" />
            <span className="text-sm font-semibold text-white">調整模擬參數</span>
          </div>

          <Slider label="社群提及成長率"   hint="mention_growth"         value={inputs.mention_growth}         onChange={set('mention_growth')} />
          <Slider label="意見領袖影響力"   hint="influencer_power"        value={inputs.influencer_power}       onChange={set('influencer_power')} />
          <Slider label="狂熱散戶比例"     hint="fanatic_ratio"           value={inputs.fanatic_ratio}          onChange={set('fanatic_ratio')} />
          <Slider label="空頭利息比例"     hint="short_interest (1=100%)" value={inputs.short_interest}         onChange={set('short_interest')} />
          <Slider label="成交量激增倍數"   hint="volume_spike"            value={inputs.volume_spike}           onChange={set('volume_spike')} />
          <Slider label="理性投資者比例"   hint="rational_investor_ratio" value={inputs.rational_investor_ratio} onChange={set('rational_investor_ratio')} />

          {/* Trading restriction toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-white">交易限制事件</span>
              <span className="text-xs ml-2" style={{ color: '#64748b' }}>trading_restriction</span>
            </div>
            <button
              onClick={() => set('trading_restriction')(!inputs.trading_restriction)}
              className="px-3 py-1 rounded text-xs font-semibold transition-colors"
              style={inputs.trading_restriction
                ? { background: '#450a0a', color: '#f87171', border: '1px solid #991b1b' }
                : { background: '#1e2235', color: '#64748b', border: '1px solid #2d3148' }}
            >
              {inputs.trading_restriction ? '已觸發' : '未觸發'}
            </button>
          </div>

          <button
            onClick={() => runMutation.mutate(inputs)}
            disabled={runMutation.isPending}
            className="mt-2 px-4 py-2 rounded-md text-sm font-semibold transition-opacity disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: '#a78bfa', color: '#fff' }}
          >
            {runMutation.isPending ? '模擬中…' : '執行模擬'}
          </button>
        </div>

        {/* Results panel */}
        <div className="flex flex-col gap-4">
          {result ? (
            <>
              {/* Risk score */}
              <div className="rounded-lg p-4" style={{ background: rBg, border: `1px solid ${rColor}44` }}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-white">模擬結果</span>
                  <div className="flex items-center gap-2">
                    {savedId && <span className="text-xs" style={{ color: '#10b981' }}>已儲存 #{savedId}</span>}
                    {!fromApi && <span className="text-xs" style={{ color: '#64748b' }}>本地模擬</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-4xl font-bold" style={{ color: rColor }}>
                    {result.simulated_risk_score.toFixed(1)}
                  </div>
                  <div>
                    <span className="text-lg font-bold" style={{ color: rColor }}>{result.simulated_risk_label}</span>
                    <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>模擬風險評級</div>
                  </div>
                </div>
                {result.key_drivers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {result.key_drivers.map(d => (
                      <span key={d} className="text-xs px-2 py-0.5 rounded" style={{ background: '#2d3148', color: '#94a3b8' }}>{d}</span>
                    ))}
                  </div>
                )}
                <p className="text-xs mt-3 leading-relaxed" style={{ color: '#94a3b8' }}>{result.explanation}</p>
              </div>

              {/* Belief diffusion chart */}
              {beliefChart.length > 0 && (
                <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
                  <div className="text-xs font-semibold mb-2 text-white">信念擴散曲線 (Belief Diffusion)</div>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={beliefChart}>
                      <CartesianGrid stroke="#2d3148" strokeDasharray="3 3" />
                      <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 9 }} />
                      <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 9 }} />
                      <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 4 }} itemStyle={{ fontSize: 10 }} />
                      <Line dataKey="belief" name="信念%" stroke="#a78bfa" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Price curve */}
              {priceChart.length > 0 && (
                <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
                  <div className="text-xs font-semibold mb-2 text-white">模擬價格曲線</div>
                  <ResponsiveContainer width="100%" height={120}>
                    <LineChart data={priceChart}>
                      <CartesianGrid stroke="#2d3148" strokeDasharray="3 3" />
                      <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 9 }} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 9 }} />
                      <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 4 }} itemStyle={{ fontSize: 10 }} />
                      <ReferenceLine x={8} stroke="#ef444455" strokeDasharray="4 2" label={{ value: '高峰', fill: '#ef4444', fontSize: 9 }} />
                      <Line dataKey="price" name="價格" stroke={rColor} dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-lg p-8 flex items-center justify-center"
                 style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <p className="text-sm" style={{ color: '#64748b' }}>調整左側參數後點擊「執行模擬」</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
