import { useQuery } from '@tanstack/react-query'
import { Brain, BarChart2, Award } from 'lucide-react'
import { phpGet } from '../api/phpClient'
import { TopBar } from '../components/layout/TopBar'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'

// ── types ────────────────────────────────────────────────────────────────────

interface Experiment {
  id: number
  experiment_id: string
  model_name: string
  feature_set: string
  accuracy: number
  macro_f1: number
  weighted_f1: number
  high_risk_recall: number
  confusion_matrix?: number[][]
  feature_importance?: Record<string, number>
  model_path: string | null
  trained_at: string | null
}

// ── demo fallback ─────────────────────────────────────────────────────────────

const DEMO_EXPERIMENTS: Experiment[] = [
  { id: 1, experiment_id: 'exp_baseline_001', model_name: 'Logistic Regression',           feature_set: 'market_features',             accuracy: 0.84, macro_f1: 0.79, weighted_f1: 0.83, high_risk_recall: 0.76, confusion_matrix: [[80,10,5],[12,70,8],[6,9,85]],    feature_importance: { mention_growth: 0.22, volume_spike: 0.18, short_interest: 0.15 },                              model_path: 'models/logistic_baseline.pkl', trained_at: null },
  { id: 2, experiment_id: 'exp_rf_001',       model_name: 'Random Forest',                 feature_set: 'market_social_features',      accuracy: 0.90, macro_f1: 0.87, weighted_f1: 0.90, high_risk_recall: 0.88, confusion_matrix: [[86,7,2],[8,76,6],[3,7,90]],     feature_importance: { mention_growth: 0.25, fomo_score: 0.21, short_squeeze_pressure: 0.19 },                       model_path: 'models/random_forest.pkl',     trained_at: null },
  { id: 3, experiment_id: 'exp_gb_001',       model_name: 'Gradient Boosting',             feature_set: 'text_social_market_features', accuracy: 0.94, macro_f1: 0.93, weighted_f1: 0.94, high_risk_recall: 0.95, confusion_matrix: [[91,4,0],[5,82,3],[1,4,95]],     feature_importance: { manipulation_signal_score: 0.27, fomo_score: 0.24, mention_growth: 0.18 },                   model_path: 'models/gradient_boosting.pkl', trained_at: null },
  { id: 4, experiment_id: 'exp_mlp_001',      model_name: 'MLP Neural Network',            feature_set: 'neural_fusion_features',      accuracy: 0.92, macro_f1: 0.90, weighted_f1: 0.92, high_risk_recall: 0.91, confusion_matrix: [[88,6,1],[6,80,4],[2,6,92]],     feature_importance: { text_embedding: 0.31, short_interest: 0.22, social_hype_score: 0.20 },                       model_path: 'models/mlp_fusion.pkl',        trained_at: null },
  { id: 5, experiment_id: 'exp_tfidf_lr_001', model_name: 'TF-IDF + Logistic Regression', feature_set: 'tfidf_text_features',         accuracy: 0.81, macro_f1: 0.77, weighted_f1: 0.80, high_risk_recall: 0.74, confusion_matrix: [[78,12,5],[14,68,8],[7,10,82]], feature_importance: { hype_term_count: 0.29, urgency_term_count: 0.24, squeeze_keyword_count: 0.20 },                model_path: 'models/tfidf_lr.pkl',          trained_at: null },
]

// ── helpers ──────────────────────────────────────────────────────────────────

const CHART_COLORS = ['#10b981', '#38bdf8', '#a78bfa', '#f97316', '#f59e0b']

function MetricBadge({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg"
         style={{ background: highlight ? '#052e16' : '#1e2235', border: highlight ? '1px solid #065f46' : '1px solid #2d3148' }}>
      <span className="text-base font-bold font-mono" style={{ color: highlight ? '#10b981' : '#f1f5f9' }}>
        {(value * 100).toFixed(1)}%
      </span>
      <span className="text-[10px]" style={{ color: '#64748b' }}>{label}</span>
    </div>
  )
}

function ConfusionMatrix({ matrix }: { matrix: number[][] }) {
  const rows = matrix.length
  const flat = matrix.flat()
  const max  = Math.max(...flat, 1)
  const labels = rows === 3 ? ['Low', 'Med', 'High'] : rows === 4 ? ['Low', 'Med', 'High', 'Crit'] : matrix.map((_, i) => `C${i}`)
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-[10px] mb-1" style={{ color: '#64748b' }}>混淆矩陣（預測→）</div>
      <div style={{ display: 'grid', gridTemplateColumns: `auto repeat(${rows}, 1fr)`, gap: 2 }}>
        <div />
        {labels.map(l => <div key={l} className="text-[10px] text-center font-semibold" style={{ color: '#94a3b8' }}>{l}</div>)}
        {matrix.map((row, ri) => [
          <div key={`l${ri}`} className="text-[10px] flex items-center justify-end pr-1 font-semibold" style={{ color: '#94a3b8' }}>{labels[ri]}</div>,
          ...row.map((cell, ci) => {
            const alpha = 0.15 + (cell / max) * 0.7
            const bg = ri === ci ? `rgba(16,185,129,${alpha})` : `rgba(239,68,68,${alpha * 0.5})`
            return (
              <div key={`${ri}_${ci}`}
                   className="w-10 h-10 flex items-center justify-center text-xs font-mono rounded"
                   style={{ background: bg, color: '#f1f5f9' }}>
                {cell}
              </div>
            )
          })
        ])}
      </div>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export function ModelLab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['php-model-experiments'],
    queryFn: () => phpGet<{ count: number; experiments: Experiment[] }>('/model_experiments.php'),
    retry: 1,
  })

  const experiments = data?.experiments ?? DEMO_EXPERIMENTS
  const usingDemo   = !data

  // chart data
  const chartData = experiments.map(e => ({
    name:           e.model_name.replace('Logistic Regression', 'LR').replace('Gradient Boosting', 'GB').replace('MLP Neural Network', 'MLP').replace('Random Forest', 'RF').replace('TF-IDF + ', ''),
    accuracy:       +(e.accuracy     * 100).toFixed(1),
    macro_f1:       +(e.macro_f1     * 100).toFixed(1),
    hr_recall:      +(e.high_risk_recall * 100).toFixed(1),
    weighted_f1:    +(e.weighted_f1  * 100).toFixed(1),
  }))

  const best = experiments[0]  // sorted by weighted_f1 desc from PHP

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="模型實驗室" />

      <div className="p-6 flex flex-col gap-6 max-w-6xl mx-auto w-full">

        {usingDemo && (
          <div className="px-4 py-2 rounded-lg text-xs" style={{ background: '#1c1a05', border: '1px solid #78350f', color: '#fcd34d' }}>
            PHP API 未連線，顯示 Demo 模型資料
          </div>
        )}

        {/* Best model highlight */}
        {best && (
          <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #065f46' }}>
            <div className="flex items-center gap-2 mb-3">
              <Award size={16} color="#10b981" />
              <span className="text-sm font-semibold text-white">最佳模型：{best.model_name}</span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#2d3148', color: '#94a3b8' }}>
                {best.feature_set}
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              <MetricBadge label="Accuracy"        value={best.accuracy}          highlight />
              <MetricBadge label="Macro F1"         value={best.macro_f1} />
              <MetricBadge label="Weighted F1"      value={best.weighted_f1}       highlight />
              <MetricBadge label="High-Risk Recall" value={best.high_risk_recall}  highlight />
            </div>
          </div>
        )}

        {/* Comparison bar chart */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={14} color="#38bdf8" />
            <span className="text-sm font-semibold text-white">模型比較（Weighted F1 / High-Risk Recall）</span>
          </div>
          {isLoading ? (
            <div className="h-48 animate-pulse rounded" style={{ background: '#2d3148' }} />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} barCategoryGap="25%">
                <CartesianGrid stroke="#2d3148" strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#1a1d27', border: '1px solid #2d3148', borderRadius: 6 }}
                  itemStyle={{ fontSize: 11 }}
                />
                <Bar dataKey="weighted_f1" name="Weighted F1" radius={[3,3,0,0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
                <Bar dataKey="hr_recall" name="High-Risk Recall %" fill="#38bdf8" radius={[3,3,0,0]} fillOpacity={0.6} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Detail table */}
        <div className="rounded-lg overflow-hidden" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #2d3148' }}>
            <span className="text-sm font-semibold text-white">所有實驗紀錄</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid #2d3148' }}>
                  {['模型', '特徵組合', 'Accuracy', 'Macro F1', 'Weighted F1', 'High-Risk Recall'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {experiments.map((exp, i) => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid #1f2235', background: i === 0 ? '#0f1a14' : 'transparent' }}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-white">{exp.model_name}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{exp.experiment_id}</div>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#94a3b8' }}>{exp.feature_set}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#f1f5f9' }}>{(exp.accuracy * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: '#f1f5f9' }}>{(exp.macro_f1 * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: '#10b981' }}>{(exp.weighted_f1 * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: exp.high_risk_recall >= 0.9 ? '#10b981' : exp.high_risk_recall >= 0.8 ? '#f59e0b' : '#ef4444' }}>
                      {(exp.high_risk_recall * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Confusion matrix for best model */}
        {best?.confusion_matrix && best.confusion_matrix.length > 0 && (
          <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
            <div className="flex items-center gap-2 mb-4">
              <Brain size={14} color="#a78bfa" />
              <span className="text-sm font-semibold text-white">最佳模型混淆矩陣：{best.model_name}</span>
            </div>
            <ConfusionMatrix matrix={best.confusion_matrix} />
          </div>
        )}
      </div>
    </div>
  )
}
