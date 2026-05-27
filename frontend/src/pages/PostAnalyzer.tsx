import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { ShieldAlert, Send, Zap, AlertTriangle, CheckCircle } from 'lucide-react'
import { phpPost } from '../api/phpClient'
import { TopBar } from '../components/layout/TopBar'

// ── types ────────────────────────────────────────────────────────────────────

interface AnalyzeRequest {
  text: string
  symbol?: string
}

interface AnalyzeResult {
  sentiment_score: number
  bullish_probability: number
  bearish_probability: number
  fomo_score: number
  hype_language_score: number
  manipulation_signal_score: number
  urgency_score: number
  short_squeeze_narrative_detected: boolean
  predicted_risk_label: 'Critical' | 'High' | 'Medium' | 'Low'
  explanation: string
  highlighted_terms: string[]
  model_source: string
  data_quality: string
}

// ── static demo fallback ─────────────────────────────────────────────────────

function heuristicAnalyze(text: string): AnalyzeResult {
  const lower = text.toLowerCase()
  const hypeTerms   = ['moon','squeeze','diamond','hodl','trapped','explodes','to the moon','apes','tendies','yolo']
  const fomoTerms   = ['buy now','last chance','miss out','before it','don\'t miss','act fast']
  const squeezeTerms= ['short squeeze','shorts are trapped','short interest','squeeze','citadel','hedge fund']
  const manipTerms  = ['buy now','act fast','guaranteed','can\'t lose','100%','manipulation']

  const hypeHits   = hypeTerms.filter(t => lower.includes(t))
  const fomoHits   = fomoTerms.filter(t => lower.includes(t))
  const squeezeHit = squeezeTerms.some(t => lower.includes(t))
  const manipHits  = manipTerms.filter(t => lower.includes(t))

  const hypeScore   = Math.min(100, hypeHits.length   * 22)
  const fomoScore   = Math.min(100, fomoHits.length   * 35)
  const manipScore  = Math.min(100, manipHits.length  * 30)
  const urgency     = Math.min(100, fomoHits.length   * 40 + hypeHits.length * 10)
  const sentiment   = hypeHits.length > 0 ? 0.7 : 0.4
  const bullish     = sentiment
  const bearish     = 1 - bullish

  const composite = hypeScore * 0.3 + fomoScore * 0.3 + manipScore * 0.25 + (squeezeHit ? 30 : 0) * 0.15
  const label: AnalyzeResult['predicted_risk_label'] =
    composite >= 70 ? 'Critical' :
    composite >= 45 ? 'High' :
    composite >= 20 ? 'Medium' : 'Low'

  const highlighted = [...hypeHits, ...fomoHits, ...(squeezeHit ? ['short squeeze'] : []), ...manipHits]

  return {
    sentiment_score: sentiment,
    bullish_probability: bullish,
    bearish_probability: bearish,
    fomo_score: fomoScore,
    hype_language_score: hypeScore,
    manipulation_signal_score: manipScore,
    urgency_score: urgency,
    short_squeeze_narrative_detected: squeezeHit,
    predicted_risk_label: label,
    explanation: `Detected ${hypeHits.length} hype term(s), ${fomoHits.length} FOMO term(s)${squeezeHit ? ', and short squeeze narrative' : ''}. Risk assessed as ${label}.`,
    highlighted_terms: [...new Set(highlighted)],
    model_source: 'keyword_heuristic_v0.1',
    data_quality: 'heuristic',
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const RISK_COLOR = { Critical: '#ef4444', High: '#f97316', Medium: '#f59e0b', Low: '#10b981' }
const RISK_BG    = { Critical: '#450a0a', High: '#431407', Medium: '#451a03', Low: '#052e16' }

function ScoreMeter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-xs" style={{ color: '#64748b' }}>
        <span>{label}</span>
        <span style={{ color }} className="font-mono">{(value * 100).toFixed(0)}</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: '#2d3148' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${Math.min(100, value * 100)}%`, background: color }}
        />
      </div>
    </div>
  )
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <span className="text-sm text-white">{text}</span>
  const pattern = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = text.split(pattern)
  return (
    <span className="text-sm">
      {parts.map((part, i) => {
        const isHighlighted = terms.some(t => t.toLowerCase() === part.toLowerCase())
        return isHighlighted ? (
          <mark key={i} className="rounded px-0.5 font-semibold" style={{ background: '#451a03', color: '#fb923c' }}>
            {part}
          </mark>
        ) : (
          <span key={i} className="text-white">{part}</span>
        )
      })}
    </span>
  )
}

// ── US tickers for quick-fill ─────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'GME 極端炒作', text: 'GME to the moon! Shorts are trapped. Buy now before it explodes. Diamond hands HODL!', symbol: 'GME' },
  { label: 'AMC FOMO', text: 'AMC last chance to get in before the squeeze. Don\'t miss this, apes together strong.', symbol: 'AMC' },
  { label: 'BB 中立', text: 'BlackBerry has decent patents. Not sure it squeezes but worth watching.', symbol: 'BB' },
  { label: 'NVDA 正常', text: 'NVIDIA strong earnings beat on AI demand. Long-term hold for sure.', symbol: 'NVDA' },
]

// ── main page ─────────────────────────────────────────────────────────────────

export function PostAnalyzer() {
  const [inputText, setInputText]   = useState('')
  const [symbol, setSymbol]         = useState('GME')
  const [result, setResult]         = useState<AnalyzeResult | null>(null)
  const [savedId, setSavedId]       = useState<number | null>(null)
  const [apiSource, setApiSource]   = useState<'fastapi' | 'heuristic' | null>(null)

const analyzeMutation = useMutation({
  mutationFn: async (req: AnalyzeRequest): Promise<AnalyzeResult> => {
    // Public InfinityFree version:
    // Do not call localhost FastAPI. Use browser-side heuristic inference.
    return heuristicAnalyze(req.text)
  },
    onSuccess: async (data, vars) => {
      setResult(data)
      setApiSource(data.model_source.includes('heuristic') ? 'heuristic' : 'fastapi')
      // Save to PHP / SQL Server
      try {
        const saved = await phpPost<{ id: number }>('/save_prediction.php', {
          input_text:                vars.text,
          symbol_detected:           vars.symbol,
          sentiment_score:           data.sentiment_score,
          bullish_probability:       data.bullish_probability,
          bearish_probability:       data.bearish_probability,
          fomo_score:                data.fomo_score,
          hype_language_score:       data.hype_language_score,
          manipulation_signal_score: data.manipulation_signal_score,
          urgency_score:             data.urgency_score,
          short_squeeze_narrative:   data.short_squeeze_narrative_detected,
          predicted_risk_label:      data.predicted_risk_label,
          explanation:               data.explanation,
          model_version:             data.model_source,
        })
        setSavedId(saved.id)
      } catch {
        // Save to PHP is optional; don't block the UI
      }
    },
  })

  const riskColor = result ? (RISK_COLOR[result.predicted_risk_label] ?? '#10b981') : '#64748b'
  const riskBg    = result ? (RISK_BG[result.predicted_risk_label]    ?? '#052e16') : '#1a1d27'

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="貼文風險分析" />

      <div className="p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">

        {/* Input card */}
        <div className="rounded-lg p-5" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={16} color="#ef4444" />
            <span className="text-sm font-semibold text-white">輸入社群貼文進行 AI 風險分析</span>
          </div>

          {/* Quick examples */}
          <div className="flex flex-wrap gap-2 mb-3">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                onClick={() => { setInputText(ex.text); setSymbol(ex.symbol) }}
                className="text-xs px-2 py-1 rounded transition-colors"
                style={{ background: '#2d3148', color: '#94a3b8', border: '1px solid #3d4163' }}
              >
                {ex.label}
              </button>
            ))}
          </div>

          {/* Symbol selector */}
          <div className="flex items-center gap-2 mb-3">
            <label className="text-xs font-semibold" style={{ color: '#64748b' }}>標的</label>
            <select
              value={symbol}
              onChange={e => setSymbol(e.target.value)}
              className="text-xs px-2 py-1.5 rounded outline-none"
              style={{ background: '#0d0f1a', border: '1px solid #2d3148', color: '#f1f5f9' }}
            >
              {['GME','AMC','BB','KOSS','NOK','TSLA','PLTR','NVDA'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder="貼上 Reddit / Twitter / StockTwits 貼文..."
            rows={4}
            className="w-full text-sm p-3 rounded-md resize-none outline-none"
            style={{ background: '#0d0f1a', border: '1px solid #2d3148', color: '#f1f5f9' }}
          />

          <div className="flex justify-end mt-3">
            <button
              onClick={() => analyzeMutation.mutate({ text: inputText, symbol })}
              disabled={!inputText.trim() || analyzeMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-opacity disabled:opacity-40"
              style={{ background: '#10b981', color: '#fff' }}
            >
              {analyzeMutation.isPending
                ? <><RefreshCw size={14} className="animate-spin" /> 分析中…</>
                : <><Send size={14} /> 分析貼文</>
              }
            </button>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className="rounded-lg p-5 flex flex-col gap-5" style={{ background: riskBg, border: `1px solid ${riskColor}33` }}>
            {/* Risk label */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className="text-lg font-bold px-4 py-1.5 rounded-full"
                  style={{ background: riskColor + '22', color: riskColor, border: `1px solid ${riskColor}` }}
                >
                  {result.predicted_risk_label} Risk
                </span>
                <span className="text-xs" style={{ color: '#64748b' }}>
                  來源：{result.model_source} {apiSource === 'heuristic' && '(本地推論)'}
                </span>
              </div>
              {savedId && (
                <span className="flex items-center gap-1 text-xs" style={{ color: '#10b981' }}>
                  <CheckCircle size={12} /> 已儲存 #{savedId}
                </span>
              )}
            </div>

            {/* Highlighted text */}
            <div className="p-3 rounded-md leading-6" style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}>
              <HighlightedText text={inputText} terms={result.highlighted_terms} />
            </div>

            {/* Score meters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ScoreMeter label="FOMO 語言強度"   value={result.fomo_score / 100}               color="#a78bfa" />
              <ScoreMeter label="炒作語言強度"     value={result.hype_language_score / 100}      color={riskColor} />
              <ScoreMeter label="操縱信號強度"     value={result.manipulation_signal_score / 100} color="#f97316" />
              <ScoreMeter label="緊迫感強度"       value={result.urgency_score / 100}            color="#38bdf8" />
              <ScoreMeter label="看多概率"         value={result.bullish_probability}            color="#10b981" />
              <ScoreMeter label="看空概率"         value={result.bearish_probability}            color="#ef4444" />
            </div>

            {/* Short squeeze flag */}
            {result.short_squeeze_narrative_detected && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold"
                   style={{ background: '#450a0a', color: '#f87171', border: '1px solid #991b1b' }}>
                <Zap size={14} /> 偵測到軋空（Short Squeeze）敘事
              </div>
            )}

            {/* Explanation */}
            <div className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
              {result.explanation}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Fix missing RefreshCw import
function RefreshCw({ size, className }: { size: number; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         className={className}>
      <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  )
}
