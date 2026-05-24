import { useState } from 'react'
import { analyzeFakeNews } from '../api/fakeNews'
import type { FakeNewsResponse, FakeNewsFeature } from '../types/api'

const SAMPLE_TEXTS = [
  {
    label: '假新聞範例',
    text: '$GME IS GOING TO $1000!!! SHORTS ARE GETTING DESTROYED!!! BUY BUY BUY NOW BEFORE IT\'S TOO LATE!!! THIS IS THE GREATEST SHORT SQUEEZE IN HISTORY!!! APES TOGETHER STRONG!!!',
  },
  {
    label: '真實新聞範例',
    text: 'GameStop Corp. shares rose approximately 12% on Thursday following elevated trading volume in options markets. Analysts noted a significant short interest ratio of 35%, raising concerns about potential volatility. The company reported quarterly revenue of $1.2 billion, falling short of analyst estimates.',
  },
  {
    label: '可疑內容範例',
    text: 'BREAKING: Insider sources reveal major hedge funds planning to CRASH the market next week! $TSLA $AAPL $GME all targeted! This information comes from sources close to the situation who wish to remain anonymous. Act now before it\'s too late!!!',
  },
]

const FEATURE_LABELS: Record<string, string> = {
  word_count: '字數',
  uppercase_ratio: '大寫比例',
  exclamation_count: '驚嘆號數量',
  question_count: '問號數量',
  sentiment_score: '情感分數',
  sentiment_extremity: '情感極端度',
  avg_word_length: '平均字長',
  unique_word_ratio: '詞彙多樣性',
  stock_mention_count: '股票提及數',
  url_count: 'URL 數量',
  quote_count: '引用數量',
  source_credibility: '來源可信度',
}

function ProbabilityDial({ probability }: { probability: number }) {
  const pct = Math.round(probability * 100)
  const color =
    probability >= 0.65
      ? '#ef4444'
      : probability >= 0.35
      ? '#f59e0b'
      : '#10b981'

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 120,
          height: 120,
          background: `conic-gradient(${color} ${pct}%, #1e2235 ${pct}%)`,
        }}
      >
        <div
          className="flex flex-col items-center justify-center rounded-full"
          style={{ width: 90, height: 90, background: '#1a1d27' }}
        >
          <span className="text-2xl font-bold text-white">{pct}%</span>
        </div>
      </div>
      <span className="text-xs" style={{ color: '#64748b' }}>
        假新聞機率
      </span>
    </div>
  )
}

function LabelBadge({ label }: { label: string }) {
  const configs: Record<string, { text: string; bg: string; color: string }> = {
    fake: { text: '假新聞', bg: '#7f1d1d', color: '#fca5a5' },
    uncertain: { text: '可疑內容', bg: '#78350f', color: '#fcd34d' },
    real: { text: '真實新聞', bg: '#064e3b', color: '#6ee7b7' },
  }
  const cfg = configs[label] ?? configs['uncertain']
  return (
    <span
      className="px-3 py-1 rounded-full text-sm font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      {cfg.text}
    </span>
  )
}

function FeatureRow({ feature }: { feature: FakeNewsFeature }) {
  const impactColors: Record<string, string> = {
    fake_signal: '#f87171',
    real_signal: '#34d399',
    neutral: '#94a3b8',
  }
  const color = impactColors[feature.impact] ?? '#94a3b8'
  const label = FEATURE_LABELS[feature.name] ?? feature.name

  return (
    <tr style={{ borderBottom: '1px solid #1f2235' }}>
      <td className="py-2 pr-4 text-sm" style={{ color: '#94a3b8' }}>
        {label}
      </td>
      <td className="py-2 pr-4 text-sm font-mono text-white">
        {typeof feature.value === 'number' && feature.value < 1 && feature.value > 0
          ? (feature.value * 100).toFixed(1) + '%'
          : feature.value.toFixed(2)}
      </td>
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2">
          <div
            className="rounded-full"
            style={{
              width: Math.max(4, feature.importance * 200),
              height: 6,
              background: color,
              maxWidth: 80,
            }}
          />
          <span className="text-xs" style={{ color }}>
            {feature.impact === 'fake_signal'
              ? '假訊號'
              : feature.impact === 'real_signal'
              ? '真實訊號'
              : '中性'}
          </span>
        </div>
      </td>
    </tr>
  )
}

function SkeletonLoader() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-4 rounded" style={{ background: '#1e2235', width: '60%' }} />
      <div className="h-4 rounded" style={{ background: '#1e2235', width: '40%' }} />
      <div className="h-24 rounded" style={{ background: '#1e2235' }} />
      <div className="h-4 rounded" style={{ background: '#1e2235', width: '80%' }} />
    </div>
  )
}

export function FakeNewsDetector() {
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<FakeNewsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleAnalyze = async () => {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await analyzeFakeNews(text, url || undefined)
      setResult(data)
    } catch (e: unknown) {
      setError('分析失敗，請稍後再試。')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSample = (sample: { text: string }) => {
    setText(sample.text)
    setResult(null)
    setError(null)
  }

  return (
    <div className="flex flex-col h-screen overflow-auto p-6" style={{ color: '#e2e8f0' }}>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">假新聞偵測</h1>
        <p className="text-sm" style={{ color: '#64748b' }}>
          貼上財經新聞標題或內文，AI 將分析其可信度
        </p>
      </div>

      <div className="flex flex-col xl:flex-row gap-6 flex-1 min-h-0">
        {/* Input panel */}
        <div className="flex flex-col gap-4 xl:w-1/2">
          {/* Sample buttons */}
          <div className="flex flex-wrap gap-2">
            {SAMPLE_TEXTS.map((s) => (
              <button
                key={s.label}
                onClick={() => handleSample(s)}
                className="px-3 py-1 rounded text-xs font-medium transition-colors"
                style={{
                  background: '#1e2235',
                  color: '#94a3b8',
                  border: '1px solid #2d3148',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.color = '#e2e8f0'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.color = '#94a3b8'
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Text area */}
          <div
            className="rounded-lg p-4 flex flex-col gap-3 flex-1"
            style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
          >
            <label className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#64748b' }}>
              新聞內文
            </label>
            <textarea
              className="flex-1 resize-none bg-transparent outline-none text-sm text-white placeholder-gray-600"
              style={{ minHeight: 160 }}
              placeholder="貼上新聞標題或完整內文…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          {/* URL input */}
          <div
            className="rounded-lg p-3 flex items-center gap-3"
            style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
          >
            <span className="text-xs font-semibold uppercase tracking-widest shrink-0" style={{ color: '#64748b' }}>
              來源 URL（選填）
            </span>
            <input
              className="flex-1 bg-transparent outline-none text-sm text-white placeholder-gray-600"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          {/* Analyze button */}
          <button
            onClick={handleAnalyze}
            disabled={loading || !text.trim()}
            className="py-3 rounded-lg font-semibold text-sm transition-opacity"
            style={{
              background: text.trim() && !loading
                ? 'linear-gradient(135deg, #10b981, #0ea5e9)'
                : '#1e2235',
              color: text.trim() && !loading ? 'white' : '#4a5568',
              cursor: text.trim() && !loading ? 'pointer' : 'not-allowed',
            }}
          >
            {loading ? '分析中…' : '分析'}
          </button>

          {error && (
            <div
              className="rounded-lg p-3 text-sm"
              style={{ background: '#7f1d1d22', border: '1px solid #7f1d1d', color: '#fca5a5' }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Results panel */}
        <div className="flex flex-col gap-4 xl:w-1/2">
          {loading && (
            <div
              className="rounded-lg p-6"
              style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
            >
              <SkeletonLoader />
            </div>
          )}

          {result && !loading && (
            <>
              {/* Main result card */}
              <div
                className="rounded-lg p-6 flex flex-col gap-4"
                style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
              >
                <div className="flex items-center gap-6 flex-wrap">
                  <ProbabilityDial probability={result.fake_probability} />
                  <div className="flex flex-col gap-3">
                    <LabelBadge label={result.label} />
                    <div className="text-xs" style={{ color: '#64748b' }}>
                      信心度：
                      <span className="text-white font-semibold">
                        {Math.round(result.confidence * 100)}%
                      </span>
                    </div>
                    {result.stock_mentions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {result.stock_mentions.map((sym) => (
                          <a
                            key={sym}
                            href={`/social-trade-risk/market-pulse?ticker=${sym}`}
                            className="px-2 py-0.5 rounded text-xs font-mono font-semibold transition-colors"
                            style={{
                              background: '#0c2340',
                              color: '#38bdf8',
                              border: '1px solid #0ea5e960',
                              textDecoration: 'none',
                            }}
                          >
                            ${sym}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Analysis text */}
                <div
                  className="rounded-md p-4 text-sm leading-relaxed"
                  style={{ background: '#0d0f1a', color: '#94a3b8' }}
                >
                  {result.analysis_text}
                </div>
              </div>

              {/* Feature breakdown */}
              {result.contributing_features.length > 0 && (
                <div
                  className="rounded-lg p-5"
                  style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
                >
                  <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#64748b' }}>
                    特徵分析
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr style={{ borderBottom: '1px solid #2d3148' }}>
                        <th className="text-left pb-2 text-xs" style={{ color: '#64748b' }}>特徵</th>
                        <th className="text-left pb-2 text-xs" style={{ color: '#64748b' }}>數值</th>
                        <th className="text-left pb-2 text-xs" style={{ color: '#64748b' }}>影響</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.contributing_features.map((f) => (
                        <FeatureRow key={f.name} feature={f} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {!result && !loading && (
            <div
              className="rounded-lg p-8 flex flex-col items-center justify-center gap-3 flex-1"
              style={{
                background: '#1a1d27',
                border: '1px dashed #2d3148',
                minHeight: 200,
              }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ background: '#1e2235' }}
              >
                <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"
                    fill="#3d4163"
                  />
                </svg>
              </div>
              <p className="text-sm text-center" style={{ color: '#3d4163' }}>
                貼上新聞文字後點擊「分析」
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
