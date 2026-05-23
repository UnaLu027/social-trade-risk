import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FlaskConical, Cpu, TrendingUp, AlertTriangle } from 'lucide-react'
import { simulateScenario } from '../api/scenario'
import { TopBar } from '../components/layout/TopBar'
import { SliderPanel } from '../components/scenario/SliderPanel'
import { HypeGauge } from '../components/charts/HypeGauge'
import type { ScenarioRequest, ScenarioResponse } from '../types/api'

const DEFAULT_PARAMS: ScenarioRequest = {
  mention_growth: 1.5,
  bullish_ratio: 0.55,
  hype_score: 45,
  influencer_activity: 0.3,
  short_interest: 0.10,
  option_activity: 1.2,
  trading_restriction: false,
}

const RISK_COLORS: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
}

export function ScenarioLab() {
  const [params, setParams] = useState<ScenarioRequest>(DEFAULT_PARAMS)
  const [result, setResult] = useState<ScenarioResponse | null>(null)

  const mutation = useMutation({
    mutationFn: simulateScenario,
    onSuccess: (data) => setResult(data),
  })

  const handleChange = (key: keyof ScenarioRequest, value: number | boolean) => {
    setParams((p) => ({ ...p, [key]: value }))
  }

  const handleSimulate = () => mutation.mutate(params)

  const riskColor = result ? RISK_COLORS[result.risk_label] ?? '#64748b' : '#64748b'

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="情境模擬" />

      <div className="p-6 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="p-2 rounded-lg" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
            <FlaskConical size={16} color="#10b981" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">模擬引擎</h2>
            <p className="text-xs" style={{ color: '#64748b' }}>
              調整社群與市場參數，模擬假設性風險情境
            </p>
          </div>
          <button
            onClick={handleSimulate}
            disabled={mutation.isPending}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{
              background: mutation.isPending ? '#1a1d27' : 'linear-gradient(135deg, #10b981, #0ea5e9)',
              color: 'white',
              opacity: mutation.isPending ? 0.6 : 1,
            }}
          >
            <Cpu size={14} />
            {mutation.isPending ? '執行中…' : '執行模擬'}
          </button>
        </div>

        <div className="grid grid-cols-5 gap-5">
          {/* Sliders */}
          <div
            className="col-span-2 rounded-lg p-5"
            style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider block mb-4" style={{ color: '#64748b' }}>
              輸入參數
            </span>
            <SliderPanel values={params} onChange={handleChange} />
          </div>

          {/* Results */}
          <div className="col-span-3 flex flex-col gap-4">
            {result ? (
              <>
                {/* Risk outcome */}
                <div
                  className="rounded-lg p-5 flex items-center gap-6"
                  style={{ background: '#1a1d27', border: `1px solid ${riskColor}30` }}
                >
                  <HypeGauge score={result.hype_score_computed} label={result.risk_label} size={130} />
                  <div className="flex-1">
                    <div
                      className="text-2xl font-bold mb-1"
                      style={{ color: riskColor }}
                    >
                      {result.risk_label_text}
                    </div>
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={12} color="#64748b" />
                      <span className="text-xs" style={{ color: '#64748b' }}>
                        主要驅動因素：<span className="font-semibold" style={{ color: '#94a3b8' }}>{result.dominant_factor}</span>
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                      {result.explanation}
                    </p>
                  </div>
                </div>

                {/* Probability bars */}
                <div className="rounded-lg p-5" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
                  <span className="text-xs font-semibold uppercase tracking-wider block mb-4" style={{ color: '#64748b' }}>
                    風險機率分佈
                  </span>
                  <div className="flex flex-col gap-3">
                    {Object.entries(result.risk_probabilities).map(([label, prob]) => (
                      <div key={label}>
                        <div className="flex justify-between mb-1">
                          <span className="text-xs capitalize" style={{ color: '#64748b' }}>{label}</span>
                          <span
                            className="text-sm font-bold tabular-nums"
                            style={{ color: RISK_COLORS[label] || '#64748b' }}
                          >
                            {(prob * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full" style={{ background: '#2d3148' }}>
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${prob * 100}%`,
                              background: RISK_COLORS[label] || '#64748b',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Comparable event */}
                {result.comparable_event && (
                  <div
                    className="rounded-lg p-4 flex items-center gap-4"
                    style={{ background: '#131627', border: '1px solid #2d3148' }}
                  >
                    <AlertTriangle size={16} color="#f59e0b" />
                    <div>
                      <p className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>
                        與 {result.comparable_event.ticker}（{result.comparable_event.date}）相似度 {result.comparable_event.similarity_pct.toFixed(0)}%
                      </p>
                      <p className="text-xs" style={{ color: '#64748b' }}>
                        歷史軋空事件 · 僅供參考
                      </p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div
                className="rounded-lg p-8 flex flex-col items-center justify-center gap-3"
                style={{ background: '#1a1d27', border: '1px solid #2d3148', minHeight: 280 }}
              >
                <FlaskConical size={32} color="#2d3148" />
                <p className="text-sm" style={{ color: '#3d4163' }}>
                  調整參數後點擊「<strong>執行模擬</strong>」
                </p>
                <p className="text-xs text-center max-w-xs" style={{ color: '#3d4163' }}>
                  疊加集成模型將預測風險等級與機率分佈
                </p>
              </div>
            )}

            {mutation.isError && (
              <div
                className="rounded-lg p-4 text-sm"
                style={{ background: '#450a0a', border: '1px solid #7f1d1d', color: '#ef4444' }}
              >
                模擬失敗。請確認 FastAPI 後端是否正在運行？
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
