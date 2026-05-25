import { useQuery } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Brain, AlertTriangle, CheckCircle, Trophy } from 'lucide-react'
import { TopBar } from '../components/layout/TopBar'
import { getModelInsights, getModelComparison } from '../api/modelInsights'
import type { CandidateResult } from '../api/modelInsights'

// ── Colour helpers ──────────────────────────────────────────────────────────
const CLASS_COLORS: Record<string, string> = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
}
const MODEL_COLORS = ['#38bdf8', '#10b981', '#f59e0b', '#a78bfa', '#fb923c']

function pct(v: number) { return `${(v * 100).toFixed(1)}%` }

// ── Confusion Matrix ────────────────────────────────────────────────────────
function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const labels = ['低風險', '中風險', '高風險']
  const rowTotals = matrix.map(row => row.reduce((a, b) => a + b, 0))
  const globalMax = Math.max(...matrix.flat())

  return (
    <div>
      <div className="text-xs mb-2" style={{ color: '#64748b' }}>
        行 = 真實標籤 &nbsp;·&nbsp; 列 = 預測標籤
      </div>
      {/* Column headers */}
      <div className="grid gap-1" style={{ gridTemplateColumns: '80px repeat(3, 1fr)' }}>
        <div />
        {labels.map(l => (
          <div key={l} className="text-center text-xs font-semibold pb-1" style={{ color: '#94a3b8' }}>{l}</div>
        ))}
        {/* Rows */}
        {matrix.map((row, i) => (
          <>
            <div
              key={`lbl-${i}`}
              className="flex items-center text-xs font-semibold"
              style={{ color: '#94a3b8' }}
            >
              {labels[i]}
            </div>
            {row.map((val, j) => {
              const isDiag = i === j
              const intensity = globalMax > 0 ? val / globalMax : 0
              const bg = isDiag
                ? `rgba(16,185,129,${0.15 + intensity * 0.55})`
                : val > 0 ? `rgba(239,68,68,${0.08 + intensity * 0.45})` : '#131627'
              const rowTotal = rowTotals[i]
              const recall = rowTotal > 0 ? val / rowTotal : 0
              return (
                <div
                  key={`${i}-${j}`}
                  className="rounded flex flex-col items-center justify-center py-2"
                  style={{ background: bg, border: '1px solid #1f2235' }}
                >
                  <span className="text-sm font-bold tabular-nums" style={{ color: isDiag ? '#10b981' : val > 0 ? '#ef4444' : '#3d4163' }}>
                    {val}
                  </span>
                  {rowTotal > 0 && (
                    <span className="text-[10px] tabular-nums" style={{ color: '#64748b' }}>
                      {(recall * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              )
            })}
          </>
        ))}
      </div>
    </div>
  )
}

// ── Per-class metrics table ─────────────────────────────────────────────────
function ClassMetricsTable({ perClass }: { perClass: Record<string, { precision: number; recall: number; f1: number; support: number }> }) {
  const rows = Object.entries(perClass)
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr style={{ borderBottom: '1px solid #2d3148' }}>
          {['類別', '精確率', '召回率', 'F1', '樣本數'].map(h => (
            <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#64748b' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(([cls, m]) => {
          const color = CLASS_COLORS[cls] ?? '#94a3b8'
          return (
            <tr key={cls} style={{ borderBottom: '1px solid #1f2235' }}>
              <td className="px-3 py-2">
                <span className="font-semibold px-2 py-0.5 rounded-full text-xs"
                  style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}>
                  {cls === 'low' ? '低' : cls === 'medium' ? '中' : '高'}
                </span>
              </td>
              {[m.precision, m.recall, m.f1].map((v, i) => (
                <td key={i} className="px-3 py-2 font-mono tabular-nums" style={{ color: v > 0.7 ? '#10b981' : v > 0.4 ? '#f59e0b' : '#ef4444' }}>
                  {pct(v)}
                </td>
              ))}
              <td className="px-3 py-2 font-mono tabular-nums" style={{ color: '#64748b' }}>{m.support}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ── Model comparison table ──────────────────────────────────────────────────
function ModelComparisonTable({ candidates, bestName }: { candidates: CandidateResult[]; bestName: string }) {
  const sorted = [...candidates].sort((a, b) => b.val_macro_f1 - a.val_macro_f1)
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr style={{ borderBottom: '1px solid #2d3148' }}>
            {['模型', '驗證 macro F1', '驗證 weighted F1', '高風險召回率', '驗證準確率', 'CV best'].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold" style={{ color: '#64748b' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, idx) => {
            const isWinner = c.name === bestName
            return (
              <tr
                key={c.name}
                style={{
                  borderBottom: '1px solid #1f2235',
                  background: isWinner ? '#0a1f12' : 'transparent',
                }}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    {isWinner && <Trophy size={11} color="#f59e0b" />}
                    <span className="font-semibold" style={{ color: isWinner ? '#10b981' : '#f1f5f9' }}>
                      {c.name}
                    </span>
                  </div>
                </td>
                {[c.val_macro_f1, c.val_weighted_f1, c.val_high_risk_recall, c.val_accuracy, c.cv_best_score].map((v, i) => (
                  <td key={i} className="px-3 py-2 font-mono tabular-nums"
                    style={{ color: v > 0.7 ? '#10b981' : v > 0.5 ? '#f59e0b' : '#ef4444' }}>
                    {pct(v)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Feature importance chart ────────────────────────────────────────────────
const FEAT_LABEL: Record<string, string> = {
  mention_count_1h:       'mention/1h',
  mention_count_24h:      'mention/24h',
  mention_growth_ratio:   'mention growth',
  bullish_ratio:          'bullish ratio',
  avg_sentiment:          'avg sentiment',
  influencer_score:       'influencer score',
  price_change_pct_1h:    'price Δ/1h',
  price_change_pct_24h:   'price Δ/24h',
  volume_spike_ratio:     'volume spike',
  short_interest_ratio:   'short interest',
  option_volume_spike:    'option spike',
  hype_score_raw:         'hype score',
  hour_of_day:            'hour of day',
  mention_accel:          'mention accel ✦',
  sentiment_volume:       'sent×volume ✦',
  risk_composite:         'risk composite ✦',
}

// ── Main page ───────────────────────────────────────────────────────────────
export function ModelInsights() {
  const { data: insights, isLoading: insightsLoading, error: insightsError } = useQuery({
    queryKey: ['modelInsights'],
    queryFn: getModelInsights,
    staleTime: 10 * 60_000,
    retry: 1,
  })

  const { data: comparison, isLoading: compLoading } = useQuery({
    queryKey: ['modelComparison'],
    queryFn: getModelComparison,
    staleTime: 10 * 60_000,
    retry: 1,
  })

  const isLoading = insightsLoading || compLoading

  // Top 10 features for bar chart
  const topFeatures = (insights?.feature_importances ?? []).slice(0, 10).map(f => ({
    ...f,
    label: FEAT_LABEL[f.feature] ?? f.feature,
  }))

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="模型洞察" />

      {insightsError && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-lg" style={{ background: '#450a0a', border: '1px solid #7f1d1d' }}>
          <p className="text-sm font-semibold" style={{ color: '#ef4444' }}>無法載入模型資訊</p>
          <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>請確認後端已部署最新版本並執行 experiment_train.py。</p>
        </div>
      )}

      <div className="p-6 flex flex-col gap-6">

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '最佳模型', value: insights?.best_model_name ?? '—', sub: insights ? `特徵集：${insights.feature_set}` : '' , color: '#10b981' },
            { label: 'Test Macro F1', value: insights ? pct(insights.test_macro_f1) : '—', sub: '多類別平衡指標', color: '#38bdf8' },
            { label: '高風險召回率', value: insights ? pct(insights.test_high_risk_recall) : '—', sub: '最關鍵指標', color: '#ef4444' },
            { label: 'Test Weighted F1', value: insights ? pct(insights.test_weighted_f1) : '—', sub: `準確率 ${insights ? pct(insights.test_accuracy) : '—'}`, color: '#f59e0b' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              {isLoading ? (
                <>
                  <div className="h-3 w-20 rounded animate-pulse mb-2" style={{ background: '#2d3148' }} />
                  <div className="h-7 w-24 rounded animate-pulse" style={{ background: '#2d3148' }} />
                </>
              ) : (
                <>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>{label}</div>
                  <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
                  <div className="text-xs mt-1" style={{ color: '#64748b' }}>{sub}</div>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Leakage warning */}
        {insights?.leakage_warning && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-lg"
            style={{ background: '#1a1000', border: '1px solid #92400e' }}>
            <AlertTriangle size={16} color="#f59e0b" className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: '#f59e0b' }}>資料洩漏警告</p>
              <p className="text-xs leading-relaxed" style={{ color: '#d97706' }}>
                {insights.leakage_warning}
              </p>
              <p className="text-xs mt-1" style={{ color: '#92400e' }}>
                可執行 <code className="font-mono px-1 py-0.5 rounded" style={{ background: '#451a03' }}>
                  python -m app.ml.experiment_train --noleakage
                </code> 進行無洩漏基準比較。
              </p>
            </div>
          </div>
        )}

        {/* Main grid: confusion matrix + per-class + feature importance */}
        <div className="grid grid-cols-5 gap-4">

          {/* Left: confusion matrix + per-class table */}
          <div className="col-span-2 flex flex-col gap-4">

            {/* Confusion Matrix */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <div className="flex items-center gap-2 mb-4">
                <Brain size={13} color="#38bdf8" />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                  混淆矩陣（測試集）
                </span>
              </div>
              {isLoading ? (
                <div className="grid gap-1" style={{ gridTemplateColumns: '80px repeat(3, 1fr)' }}>
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className="h-10 rounded animate-pulse" style={{ background: '#131627' }} />
                  ))}
                </div>
              ) : insights?.test_confusion_matrix ? (
                <ConfusionMatrix matrix={insights.test_confusion_matrix} />
              ) : (
                <div className="text-xs" style={{ color: '#64748b' }}>資料不可用</div>
              )}
            </div>

            {/* Per-class metrics */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <span className="text-xs font-semibold uppercase tracking-wider block mb-3" style={{ color: '#64748b' }}>
                各類別指標（測試集）
              </span>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-8 rounded animate-pulse" style={{ background: '#131627' }} />
                  ))}
                </div>
              ) : insights?.test_per_class ? (
                <ClassMetricsTable perClass={insights.test_per_class} />
              ) : null}
            </div>

            {/* Training stats */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <span className="text-xs font-semibold uppercase tracking-wider block mb-3" style={{ color: '#64748b' }}>
                訓練資料概覽
              </span>
              {insights ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { label: '分割方式', value: insights.split_method },
                    { label: '特徵數量', value: String(insights.n_features) },
                    { label: '訓練集', value: `${insights.n_train} 筆` },
                    { label: '驗證集', value: `${insights.n_val} 筆` },
                    { label: '測試集', value: `${insights.n_test} 筆` },
                    { label: '訓練時間', value: insights.trained_at ? new Date(insights.trained_at).toLocaleDateString('zh-TW') : '—' },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ color: '#64748b' }}>{label}</div>
                      <div className="font-mono mt-0.5" style={{ color: '#f1f5f9' }}>{value}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-20 animate-pulse rounded" style={{ background: '#131627' }} />
              )}
            </div>
          </div>

          {/* Right: feature importance + model comparison */}
          <div className="col-span-3 flex flex-col gap-4">

            {/* Feature importance */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                  特徵重要性（Top 10）
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#0c1a2e', color: '#38bdf8', border: '1px solid #1e3a5f' }}>
                  ✦ = 新增衍生特徵
                </span>
              </div>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-6 rounded animate-pulse" style={{ background: '#131627', width: `${80 - i * 7}%` }} />
                  ))}
                </div>
              ) : topFeatures.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={topFeatures}
                    layout="vertical"
                    margin={{ top: 0, right: 30, bottom: 0, left: 110 }}
                  >
                    <XAxis
                      type="number"
                      domain={[0, 'auto']}
                      tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                      tick={{ fill: '#64748b', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      width={105}
                    />
                    <Tooltip
                      contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 6 }}
                      labelStyle={{ color: '#94a3b8', fontSize: 11 }}
                      formatter={(v: number) => [`${(v * 100).toFixed(2)}%`, '重要性']}
                    />
                    <Bar dataKey="importance" radius={[0, 3, 3, 0]}>
                      {topFeatures.map((entry, index) => (
                        <Cell
                          key={entry.feature}
                          fill={entry.feature.includes('accel') || entry.feature.includes('volume') && entry.feature !== 'volume_spike_ratio' || entry.feature === 'risk_composite'
                            ? '#a78bfa'
                            : MODEL_COLORS[index % MODEL_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-xs py-4 text-center" style={{ color: '#64748b' }}>
                  特徵重要性不可用（非 RandomForest 類模型）
                </div>
              )}
            </div>

            {/* Model comparison */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={13} color="#10b981" />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                  5 模型比較（驗證集 macro F1 選優）
                </span>
                {comparison && (
                  <span className="text-xs ml-auto" style={{ color: '#64748b' }}>
                    特徵集：{comparison.feature_set} &nbsp;·&nbsp; 分割：{comparison.split_method}
                  </span>
                )}
              </div>
              {compLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-8 rounded animate-pulse" style={{ background: '#131627' }} />
                  ))}
                </div>
              ) : comparison ? (
                <ModelComparisonTable
                  candidates={comparison.candidates}
                  bestName={comparison.best_model_name}
                />
              ) : null}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
