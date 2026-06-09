import { useQuery } from '@tanstack/react-query'
import { Brain, BarChart2, Award, Server, AlertCircle, FlaskConical } from 'lucide-react'
import { phpGet } from '../api/phpClient'
import { personalApi } from '../api/personalApiClient'
import { TopBar } from '../components/layout/TopBar'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'

// ── types ─────────────────────────────────────────────────────────────────────

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
  task?: string
  production_status?: string
}

interface ColabTextModelInfo {
  available: boolean
  production_status: string
  model_id?: string
  trained_at?: string
  deploy_ready?: boolean
  smoke_tests_pass?: boolean | null
  risk_model?: string
  direction_model?: string
  risk_accuracy?: number
  risk_macro_f1?: number
  risk_weighted_f1?: number
  high_risk_recall?: number
  direction_accuracy?: number
  direction_macro_f1?: number
  direction_weighted_f1?: number
  risk_feature_set?: string
  direction_feature_set?: string
}

interface RealAiHealth {
  status?: string
  production_status?: string
  model_source?: string
  active_model_family?: string
  model_file?: string
  model_name?: string
  accuracy?: number
  macro_f1?: number
  weighted_f1?: number
  high_risk_recall?: number
  trained_at?: string
  feature_count?: number
  data_quality?: string
  text_model?: ColabTextModelInfo
  [key: string]: unknown
}

// ── demo fallback ─────────────────────────────────────────────────────────────

const DEMO_EXPERIMENTS: Experiment[] = [
  { id: 1, experiment_id: 'exp_baseline_001', model_name: 'Logistic Regression',           feature_set: 'market_features',             accuracy: 0.84, macro_f1: 0.79, weighted_f1: 0.83, high_risk_recall: 0.76, confusion_matrix: [[80,10,5],[12,70,8],[6,9,85]],    feature_importance: { mention_growth: 0.22, volume_spike: 0.18, short_interest: 0.15 },                              model_path: 'models/logistic_baseline.pkl', trained_at: null },
  { id: 2, experiment_id: 'exp_rf_001',       model_name: 'Random Forest',                 feature_set: 'market_social_features',      accuracy: 0.90, macro_f1: 0.87, weighted_f1: 0.90, high_risk_recall: 0.88, confusion_matrix: [[86,7,2],[8,76,6],[3,7,90]],     feature_importance: { mention_growth: 0.25, fomo_score: 0.21, short_squeeze_pressure: 0.19 },                       model_path: 'models/random_forest.pkl',     trained_at: null },
  { id: 3, experiment_id: 'exp_gb_001',       model_name: 'Gradient Boosting',             feature_set: 'text_social_market_features', accuracy: 0.94, macro_f1: 0.93, weighted_f1: 0.94, high_risk_recall: 0.95, confusion_matrix: [[91,4,0],[5,82,3],[1,4,95]],     feature_importance: { manipulation_signal_score: 0.27, fomo_score: 0.24, mention_growth: 0.18 },                   model_path: 'models/gradient_boosting.pkl', trained_at: null },
  { id: 4, experiment_id: 'exp_mlp_001',      model_name: 'MLP Neural Network',            feature_set: 'neural_fusion_features',      accuracy: 0.92, macro_f1: 0.90, weighted_f1: 0.92, high_risk_recall: 0.91, confusion_matrix: [[88,6,1],[6,80,4],[2,6,92]],     feature_importance: { text_embedding: 0.31, short_interest: 0.22, social_hype_score: 0.20 },                       model_path: 'models/mlp_fusion.pkl',        trained_at: null },
  { id: 5, experiment_id: 'exp_tfidf_lr_001', model_name: 'TF-IDF + Logistic Regression', feature_set: 'tfidf_text_features',         accuracy: 0.81, macro_f1: 0.77, weighted_f1: 0.80, high_risk_recall: 0.74, confusion_matrix: [[78,12,5],[14,68,8],[7,10,82]], feature_importance: { hype_term_count: 0.29, urgency_term_count: 0.24, squeeze_keyword_count: 0.20 },                model_path: 'models/tfidf_lr.pkl',          trained_at: null },
]

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── Colab model card ──────────────────────────────────────────────────────────

function ColabModelCard({ health }: { health: RealAiHealth | null }) {
  const tm = health?.text_model
  if (!tm || !tm.available) return null

  const isActive = tm.production_status === 'active'

  return (
    <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3a1f' }}>
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical size={16} color="#a78bfa" />
        <span className="text-sm font-semibold text-white">Colab 訓練模型結果</span>
        <span className="text-xs px-2 py-0.5 rounded font-semibold"
              style={{ background: isActive ? '#052e16' : '#1a1d27',
                       color: isActive ? '#10b981' : '#f59e0b',
                       border: `1px solid ${isActive ? '#065f46' : '#78350f'}` }}>
          {isActive ? 'active' : 'ready_for_deployment'}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #2d3148' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: '#a78bfa' }}>風險分類模型（Risk）</div>
          <div className="text-xs mb-1" style={{ color: '#64748b' }}>{tm.risk_model ?? 'risk_GB_tuned'}</div>
          <div className="text-[11px] mb-2" style={{ color: '#64748b' }}>特徵：{tm.risk_feature_set ?? 'word_tfidf + char_tfidf'}</div>
          <div className="flex flex-wrap gap-2">
            {tm.risk_accuracy    != null && <MetricBadge label="Accuracy"          value={tm.risk_accuracy}    highlight />}
            {tm.risk_macro_f1    != null && <MetricBadge label="Macro F1"           value={tm.risk_macro_f1} />}
            {tm.high_risk_recall != null && <MetricBadge label="High-Risk Recall *" value={tm.high_risk_recall} />}
          </div>
          <div className="text-[10px] mt-2 px-2 py-1 rounded" style={{ background: '#0f1118', color: '#6b7280', border: '1px solid #1f2235' }}>
            * High-Risk Recall = 高風險類別的召回率，非整體 accuracy。
          </div>
        </div>

        <div className="rounded-lg p-3" style={{ background: '#111827', border: '1px solid #2d3148' }}>
          <div className="text-xs font-semibold mb-2" style={{ color: '#38bdf8' }}>方向分類模型（Direction）</div>
          <div className="text-xs mb-1" style={{ color: '#64748b' }}>{tm.direction_model ?? 'direction_LogReg_tuned'}</div>
          <div className="text-[11px] mb-2" style={{ color: '#64748b' }}>特徵：{tm.direction_feature_set ?? 'word_tfidf + char_tfidf + numeric_features'}</div>
          <div className="flex flex-wrap gap-2">
            {tm.direction_accuracy != null && <MetricBadge label="Accuracy" value={tm.direction_accuracy} highlight />}
            {tm.direction_macro_f1 != null && <MetricBadge label="Macro F1" value={tm.direction_macro_f1} />}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs mt-3">
        {tm.trained_at && (
          <div className="flex flex-col gap-0.5">
            <span style={{ color: '#64748b' }}>訓練時間</span>
            <span style={{ color: '#94a3b8' }}>{new Date(tm.trained_at).toLocaleString('zh-TW')}</span>
          </div>
        )}
        {tm.deploy_ready != null && (
          <div className="flex flex-col gap-0.5">
            <span style={{ color: '#64748b' }}>部署就緒</span>
            <span style={{ color: tm.deploy_ready ? '#10b981' : '#ef4444' }}>{tm.deploy_ready ? '是' : '否'}</span>
          </div>
        )}
        {tm.smoke_tests_pass != null && (
          <div className="flex flex-col gap-0.5">
            <span style={{ color: '#64748b' }}>Smoke Tests</span>
            <span style={{ color: tm.smoke_tests_pass ? '#10b981' : '#ef4444' }}>{tm.smoke_tests_pass ? '全數通過' : '部分失敗'}</span>
          </div>
        )}
        {tm.model_id && (
          <div className="flex flex-col gap-0.5">
            <span style={{ color: '#64748b' }}>Model ID</span>
            <span className="font-mono" style={{ color: '#a78bfa' }}>{tm.model_id}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── deployed model status card ────────────────────────────────────────────────

function DeployedModelCard({ health, isLoading, isError }: { health: RealAiHealth | null; isLoading: boolean; isError: boolean }) {
  return (
    <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #1e3a5f' }}>
      <div className="flex items-center gap-2 mb-3">
        <Server size={16} color="#38bdf8" />
        <span className="text-sm font-semibold text-white">正式部署推論狀態</span>
        <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#0f2a3f', color: '#7dd3fc' }}>
          PostAnalyzer 目前實際使用的模型
        </span>
      </div>

      {isLoading && (
        <div className="h-8 animate-pulse rounded" style={{ background: '#2d3148' }} />
      )}

      {!isLoading && (isError || !health) && (
        <div className="flex items-center gap-2 text-xs" style={{ color: '#f59e0b' }}>
          <AlertCircle size={13} />
          <span>正式模型狀態暫時無法取得</span>
        </div>
      )}

      {!isLoading && !isError && health && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex flex-col gap-0.5">
              <span style={{ color: '#64748b' }}>模型狀態</span>
              <span className="font-semibold" style={{ color: health.status === 'ok' ? '#10b981' : '#f59e0b' }}>
                {health.status === 'ok' ? '已載入' : '暫時無法取得'}
              </span>
            </div>
            {health.model_source && (
              <div className="flex flex-col gap-0.5">
                <span style={{ color: '#64748b' }}>推論來源</span>
                <span style={{ color: health.model_source === 'colab_text_model' ? '#10b981' : '#94a3b8' }}>
                  {health.model_source === 'colab_text_model' ? 'Colab 文本模型' :
                   health.model_source === 'legacy_model' ? 'Legacy sklearn 模型' : '啟發式規則'}
                </span>
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <span style={{ color: '#64748b' }}>模型用途</span>
              <span style={{ color: '#f1f5f9' }}>單篇文本社群交易風險分析</span>
            </div>
            {health.model_file && (
              <div className="flex flex-col gap-0.5">
                <span style={{ color: '#64748b' }}>模型檔案</span>
                <span className="font-mono" style={{ color: '#a78bfa' }}>{health.model_file}</span>
              </div>
            )}
            {typeof health.feature_count === 'number' && (
              <div className="flex flex-col gap-0.5">
                <span style={{ color: '#64748b' }}>特徵維度</span>
                <span className="font-mono" style={{ color: '#f1f5f9' }}>{health.feature_count.toLocaleString()}</span>
              </div>
            )}
            {typeof health.accuracy === 'number' && (
              <div className="flex flex-col gap-0.5">
                <span style={{ color: '#64748b' }}>整體 Accuracy（Legacy）</span>
                <span className="font-mono font-semibold" style={{ color: '#10b981' }}>
                  {(health.accuracy * 100).toFixed(1)}%
                </span>
              </div>
            )}
          </div>

          {typeof health.accuracy === 'number' && (
            <div className="text-[11px] mt-1 px-3 py-2 rounded" style={{ background: '#0f1a14', color: '#6b7280', border: '1px solid #1f3a2a' }}>
              整體 Accuracy 不代表每一風險類別或單一案例皆能正確判斷，仍需搭配 precision、recall 與案例檢核。
            </div>
          )}

          <div className="text-[11px] px-3 py-2 rounded mt-1" style={{ background: '#111827', color: '#6b7280', border: '1px solid #2d3148' }}>
            模型狀態與整體指標僅表示系統可正常執行及整體驗證結果；對於個別文本，仍可能出現局部風險訊號與整體分級不一致的情況，應透過案例檢核持續改善模型。
          </div>
        </div>
      )}
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export function ModelLab() {
  // Railway experiments — primary source
  const { data: railwayExpData } = useQuery({
    queryKey: ['railway-model-experiments'],
    queryFn: async () => {
      const res = await personalApi.get<{ source: string; experiments: Experiment[] }>('/api/v1/model-lab/experiments')
      return res.data
    },
    retry: 1,
  })

  // PHP experiments — fallback when Railway fails/unavailable
  const { data: phpExpData, isLoading: phpLoading } = useQuery({
    queryKey: ['php-model-experiments'],
    queryFn: () => phpGet<{ count: number; experiments: Experiment[] }>('/model_experiments.php'),
    enabled: !railwayExpData,
    retry: 1,
  })

  const { data: healthData, isLoading: healthLoading, isError: healthError } = useQuery({
    queryKey: ['real-ai-health'],
    queryFn: async () => {
      const res = await personalApi.get<RealAiHealth>('/api/v1/health/real-ai')
      return res.data
    },
    retry: 1,
  })

  // Experiment priority: Railway > PHP > DEMO
  const experiments: Experiment[] = railwayExpData?.experiments ?? phpExpData?.experiments ?? DEMO_EXPERIMENTS
  const usingDemo    = !railwayExpData && !phpExpData
  const usingRailway = !!railwayExpData
  const isLoading    = !railwayExpData && phpLoading

  // find best model by weighted_f1 — never assume array is pre-sorted
  const best = experiments.reduce<Experiment | null>((acc, cur) =>
    acc === null || cur.weighted_f1 > acc.weighted_f1 ? cur : acc,
  null)

  // chart data
  const chartData = experiments.map(e => ({
    name:        e.model_name.replace('Logistic Regression', 'LR').replace('Gradient Boosting', 'GB').replace('MLP Neural Network', 'MLP').replace('Random Forest', 'RF').replace('TF-IDF + ', ''),
    accuracy:    +(e.accuracy         * 100).toFixed(1),
    macro_f1:    +(e.macro_f1         * 100).toFixed(1),
    hr_recall:   +(e.high_risk_recall * 100).toFixed(1),
    weighted_f1: +(e.weighted_f1      * 100).toFixed(1),
  }))

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="模型實驗室" />

      <div className="p-6 flex flex-col gap-6 max-w-6xl mx-auto w-full">

        {/* Deployed model status card */}
        <DeployedModelCard
          health={healthData ?? null}
          isLoading={healthLoading}
          isError={healthError}
        />

        {/* Colab model card — only shown when text_model files are detected */}
        <ColabModelCard health={healthData ?? null} />

        {usingDemo && (
          <div className="px-4 py-2 rounded-lg text-xs" style={{ background: '#1c1a05', border: '1px solid #78350f', color: '#fcd34d' }}>
            尚未取得資料庫中的真實實驗紀錄，目前顯示示範用模型比較資料；此區不代表正式部署模型表現。
          </div>
        )}

        {/* Best model highlight */}
        {best && (
          <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #065f46' }}>
            <div className="flex items-center gap-2 mb-3">
              <Award size={16} color="#10b981" />
              <span className="text-sm font-semibold text-white">
                {usingDemo ? `Demo 比較資料中的最佳模型：${best.model_name}` : `實驗紀錄中的最佳模型：${best.model_name}`}
              </span>
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: '#2d3148', color: '#94a3b8' }}>
                {best.feature_set}
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              <MetricBadge label="Accuracy"        value={best.accuracy}         highlight />
              <MetricBadge label="Macro F1"         value={best.macro_f1} />
              <MetricBadge label="Weighted F1"      value={best.weighted_f1}      highlight />
              <MetricBadge label="High-Risk Recall" value={best.high_risk_recall} highlight />
            </div>
          </div>
        )}

        {/* Comparison bar chart */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={14} color="#38bdf8" />
            <span className="text-sm font-semibold text-white">
              {usingDemo
                ? '示範模型比較資料（Weighted F1 / High-Risk Recall）'
                : usingRailway
                  ? 'Colab + Legacy 模型比較（Weighted F1 / High-Risk Recall）'
                  : '實驗模型比較（Weighted F1 / High-Risk Recall）'}
            </span>
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
          {usingDemo && (
            <div className="mt-3 text-[11px] px-3 py-2 rounded" style={{ background: '#111218', color: '#6b7280', border: '1px solid #2d3148' }}>
              此處資料僅供介面與模型比較流程展示，不代表正式部署模型的訓練或驗證成果。
            </div>
          )}
        </div>

        {/* Detail table */}
        <div className="rounded-lg overflow-hidden" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #2d3148' }}>
            <span className="text-sm font-semibold text-white">
              {usingDemo ? '示範實驗紀錄' : '所有實驗紀錄'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid #2d3148' }}>
                  {['模型', '任務', '特徵組合', 'Accuracy', 'Macro F1', 'Weighted F1', 'High-Risk Recall', '狀態'].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {experiments.map((exp) => {
                  const isBest  = best?.id === exp.id
                  const isColab = exp.production_status === 'active' || exp.production_status === 'ready_for_deployment'
                  return (
                    <tr key={exp.id} style={{ borderBottom: '1px solid #1f2235', background: isBest ? '#0f1a14' : 'transparent' }}>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white">{exp.model_name}</div>
                        <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{exp.experiment_id}</div>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#94a3b8' }}>
                        {exp.task === 'risk_classification'      ? '風險分類'
                         : exp.task === 'direction_classification' ? '方向分類'
                         : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: '#94a3b8' }}>{exp.feature_set}</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: '#f1f5f9' }}>{(exp.accuracy * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 font-mono text-xs" style={{ color: '#f1f5f9' }}>{(exp.macro_f1 * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: '#10b981' }}>{(exp.weighted_f1 * 100).toFixed(1)}%</td>
                      <td className="px-4 py-3 font-mono text-xs font-semibold"
                          style={{ color: exp.high_risk_recall >= 0.9 ? '#10b981' : exp.high_risk_recall >= 0.8 ? '#f59e0b' : '#ef4444' }}>
                        {(exp.high_risk_recall * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3">
                        {isColab ? (
                          <span className="text-[10px] px-2 py-0.5 rounded font-semibold"
                                style={{ background: exp.production_status === 'active' ? '#052e16' : '#1a1a2e',
                                         color:      exp.production_status === 'active' ? '#10b981'  : '#a78bfa',
                                         border:    `1px solid ${exp.production_status === 'active' ? '#065f46' : '#4c1d95'}` }}>
                            {exp.production_status === 'active' ? 'active' : 'ready'}
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded"
                                style={{ background: '#1e2235', color: '#64748b', border: '1px solid #2d3148' }}>
                            legacy
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {usingDemo && (
            <div className="px-4 py-3 text-[11px]" style={{ borderTop: '1px solid #2d3148', color: '#6b7280' }}>
              此處資料僅供介面與模型比較流程展示，不代表正式部署模型的訓練或驗證成果。
            </div>
          )}
        </div>

        {/* Confusion matrix for best model */}
        {best?.confusion_matrix && best.confusion_matrix.length > 0 && (
          <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
            <div className="flex items-center gap-2 mb-4">
              <Brain size={14} color="#a78bfa" />
              <span className="text-sm font-semibold text-white">
                {usingDemo ? `Demo 最佳模型混淆矩陣：${best.model_name}` : `最佳模型混淆矩陣：${best.model_name}`}
              </span>
            </div>
            <ConfusionMatrix matrix={best.confusion_matrix} />
          </div>
        )}
      </div>
    </div>
  )
}
