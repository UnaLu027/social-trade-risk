import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ShieldAlert, Send, Zap, CheckCircle,
  Globe, Copy, Check, RefreshCw, Newspaper,
} from 'lucide-react'
import { phpPost } from '../api/phpClient'
import { api } from '../api/client'
import { TopBar } from '../components/layout/TopBar'
import { TickerAutocomplete } from '../components/TickerAutocomplete'

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
  risk_score?: number
  model_source: string
  data_quality: string
}

interface UrlAnalysisResult {
  success: boolean
  url: string
  symbol: string
  title: string | null
  description: string | null
  site_name: string | null
  extracted_text: string | null
  analysis: AnalyzeResult | null
  data_quality: string
  errors: { error: string; detail?: string }[]
}

interface SocialSignalItem {
  id: string
  source: string
  published_at: string
  headline: string | null
  summary: string | null
  url: string | null
  ai_risk_label: string | null
  ai_risk_score: number | null
}

type Mode = 'text' | 'url' | 'news'

// ── static demo fallback ─────────────────────────────────────────────────────

function heuristicAnalyze(text: string): AnalyzeResult {
  const lower = text.toLowerCase()
  const hypeTerms    = ['moon','squeeze','diamond','hodl','trapped','explodes','to the moon','apes','tendies','yolo']
  const fomoTerms    = ['buy now','last chance','miss out','before it','don\'t miss','act fast']
  const squeezeTerms = ['short squeeze','shorts are trapped','short interest','squeeze','citadel','hedge fund']
  const manipTerms   = ['buy now','act fast','guaranteed','can\'t lose','100%','manipulation']

  const hypeHits   = hypeTerms.filter(t => lower.includes(t))
  const fomoHits   = fomoTerms.filter(t => lower.includes(t))
  const squeezeHit = squeezeTerms.some(t => lower.includes(t))
  const manipHits  = manipTerms.filter(t => lower.includes(t))

  const hypeScore  = Math.min(100, hypeHits.length  * 22)
  const fomoScore  = Math.min(100, fomoHits.length  * 35)
  const manipScore = Math.min(100, manipHits.length * 30)
  const urgency    = Math.min(100, fomoHits.length  * 40 + hypeHits.length * 10)
  const sentiment  = hypeHits.length > 0 ? 0.7 : 0.4
  const bullish    = sentiment
  const bearish    = 1 - bullish

  const composite = hypeScore * 0.3 + fomoScore * 0.3 + manipScore * 0.25 + (squeezeHit ? 30 : 0) * 0.15
  const label: AnalyzeResult['predicted_risk_label'] =
    composite >= 70 ? 'Critical' :
    composite >= 45 ? 'High' :
    composite >= 20 ? 'Medium' : 'Low'

  const highlighted = [...hypeHits, ...fomoHits, ...(squeezeHit ? ['short squeeze'] : []), ...manipHits]
  return {
    sentiment_score: sentiment, bullish_probability: bullish, bearish_probability: bearish,
    fomo_score: fomoScore, hype_language_score: hypeScore, manipulation_signal_score: manipScore,
    urgency_score: urgency, short_squeeze_narrative_detected: squeezeHit,
    predicted_risk_label: label,
    explanation: `Detected ${hypeHits.length} hype term(s), ${fomoHits.length} FOMO term(s)${squeezeHit ? ', and short squeeze narrative' : ''}. Risk assessed as ${label}.`,
    highlighted_terms: [...new Set(highlighted)],
    model_source: 'keyword_heuristic_v0.1', data_quality: 'heuristic',
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const RISK_COLOR = { Critical: '#ef4444', High: '#f97316', Medium: '#f59e0b', Low: '#10b981' }
const RISK_BG    = { Critical: '#450a0a', High: '#431407', Medium: '#451a03', Low: '#052e16' }

const MONITORING_ACTIONS: Record<string, string> = {
  Critical: '⚠ Critical: Consider exiting or hedging immediately. High social manipulation risk.',
  High:     '⚡ High: Reduce exposure or apply strict stop-loss. Monitor for further escalation.',
  Medium:   '👁 Medium: Watch for escalating FOMO signals. Review position sizing.',
  Low:      '✓ Low: Monitor for increased social mentions. No immediate action required.',
}

function formatUtc(iso: string) {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').slice(0, 16)
}

const TICKER_ALIASES: Record<string, string[]> = {
  GME:   ['GameStop', 'GME'],
  TSLA:  ['Tesla', 'TSLA'],
  AAPL:  ['Apple', 'AAPL'],
  NVDA:  ['NVIDIA', 'NVDA'],
  AMC:   ['AMC'],
  META:  ['Meta', 'META', 'Facebook'],
  MSFT:  ['Microsoft', 'MSFT'],
  AMZN:  ['Amazon', 'AMZN'],
  GOOG:  ['Alphabet', 'Google', 'GOOG', 'GOOGL'],
  GOOGL: ['Alphabet', 'Google', 'GOOG', 'GOOGL'],
}

function isHomepageUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url)
    return pathname === '/' || pathname === ''
  } catch {
    return false
  }
}

function articleMatchesTicker(text: string, sym: string): boolean {
  const lower = text.toLowerCase()
  const aliases = TICKER_ALIASES[sym.toUpperCase()] ?? [sym]
  return aliases.some(a => lower.includes(a.toLowerCase()))
}

function generateTextSummary(res: AnalyzeResult, sym: string): string {
  return [
    'Social Trading Risk Brief',
    `Ticker: ${sym}`,
    `Risk: ${res.predicted_risk_label}`,
    `FOMO: ${res.fomo_score.toFixed(0)}`,
    `Hype: ${res.hype_language_score.toFixed(0)}`,
    `Manipulation: ${res.manipulation_signal_score.toFixed(0)}`,
    `Short squeeze: ${res.short_squeeze_narrative_detected ? 'Detected' : 'Not detected'}`,
    `Interpretation: ${res.predicted_risk_label} social-trading manipulation risk. Not investment advice.`,
  ].join('\n')
}

function generateHtmlBrief(res: AnalyzeResult, sym: string): string {
  const color  = RISK_COLOR[res.predicted_risk_label] ?? '#64748b'
  const action = MONITORING_ACTIONS[res.predicted_risk_label] ?? ''
  const now    = new Date().toISOString().slice(0, 19).replace('T', ' ')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Risk Brief: ${sym}</title></head>
<body style="margin:0;padding:20px;background:#0d0f1a;font-family:monospace;">
<div style="max-width:600px;background:#1a1d27;border:1px solid #2d3148;border-radius:8px;padding:20px;">
  <h2 style="color:#ef4444;margin:0 0 4px;font-size:1rem;">Social Trading Risk Brief</h2>
  <p style="color:#64748b;font-size:0.75rem;margin:0 0 16px;">Generated ${now} UTC · Social Trading Risk Copilot</p>
  <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
    <tr><td style="color:#64748b;padding:4px 8px 4px 0;width:160px;">Ticker</td><td style="color:#f1f5f9;font-weight:bold;">${sym}</td></tr>
    <tr><td style="color:#64748b;padding:4px 8px 4px 0;">Risk Label</td><td style="color:${color};font-weight:bold;">${res.predicted_risk_label}</td></tr>
    <tr><td style="color:#64748b;padding:4px 8px 4px 0;">FOMO Score</td><td style="color:#f1f5f9;">${res.fomo_score.toFixed(0)}</td></tr>
    <tr><td style="color:#64748b;padding:4px 8px 4px 0;">Hype Score</td><td style="color:#f1f5f9;">${res.hype_language_score.toFixed(0)}</td></tr>
    <tr><td style="color:#64748b;padding:4px 8px 4px 0;">Manipulation</td><td style="color:#f1f5f9;">${res.manipulation_signal_score.toFixed(0)}</td></tr>
    <tr><td style="color:#64748b;padding:4px 8px 4px 0;">Short Squeeze</td><td style="color:#f1f5f9;">${res.short_squeeze_narrative_detected ? '⚠ Detected' : 'Not detected'}</td></tr>
    <tr><td style="color:#64748b;padding:4px 8px 4px 0;">Model Source</td><td style="color:#f1f5f9;">${res.model_source}</td></tr>
    <tr><td style="color:#64748b;padding:4px 8px 4px 0;">Data Quality</td><td style="color:#f1f5f9;">${res.data_quality}</td></tr>
  </table>
  ${res.highlighted_terms.length > 0 ? `<div style="margin-top:12px;font-size:0.8rem;"><span style="color:#64748b;">Key Terms: </span><span style="color:#a78bfa;">${res.highlighted_terms.join(', ')}</span></div>` : ''}
  <div style="margin-top:12px;font-size:0.8rem;color:#94a3b8;">${res.explanation}</div>
  <div style="margin-top:12px;padding:10px;background:#0d0f1a;border-radius:4px;font-size:0.8rem;color:#f59e0b;">${action}</div>
</div>
</body></html>`
}

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

// ── quick examples ────────────────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'GME 極端炒作', text: 'GME to the moon! Shorts are trapped. Buy now before it explodes. Diamond hands HODL!', symbol: 'GME' },
  { label: 'AMC FOMO',    text: "AMC last chance to get in before the squeeze. Don't miss this, apes together strong.", symbol: 'AMC' },
  { label: 'BB 中立',     text: 'BlackBerry has decent patents. Not sure it squeezes but worth watching.', symbol: 'BB' },
  { label: 'NVDA 正常',   text: 'NVIDIA strong earnings beat on AI demand. Long-term hold for sure.', symbol: 'NVDA' },
]

// ── main page ─────────────────────────────────────────────────────────────────

export function PostAnalyzer() {
  const [activeMode, setActiveMode] = useState<Mode>('text')

  // Text mode
  const [inputText, setInputText] = useState('')
  const [symbol, setSymbol]       = useState('GME')
  const [result, setResult]       = useState<AnalyzeResult | null>(null)
  const [savedId, setSavedId]     = useState<number | null>(null)
  const [apiSource, setApiSource] = useState<'fastapi' | 'heuristic' | null>(null)

  // URL mode
  const [urlInput, setUrlInput]   = useState('')
  const [urlResult, setUrlResult] = useState<UrlAnalysisResult | null>(null)

  // Brief
  const [copiedBrief, setCopiedBrief]     = useState(false)
  const [copiedSummary, setCopiedSummary] = useState(false)

  // ── analyzeMutation (UNCHANGED) ────────────────────────────────────────────
  const analyzeMutation = useMutation({
    mutationFn: async (req: AnalyzeRequest): Promise<AnalyzeResult> => {
      try {
        const res = await api.post<AnalyzeResult>('/api/v1/post-analyze', req)
        return res.data
      } catch (err) {
        console.error('[Real AI API failed, fallback to heuristic]', err)
        return heuristicAnalyze(req.text)
      }
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

  // ── URL mutation ───────────────────────────────────────────────────────────
  const urlMutation = useMutation({
    mutationFn: async ({ url, sym }: { url: string; sym: string }) => {
      const res = await api.post<UrlAnalysisResult>('/api/v1/analyze-url', { url, symbol: sym })
      return res.data
    },
    onSuccess: (data) => {
      setUrlResult(data)
      if (data.analysis) {
        setResult(data.analysis)
        setApiSource('fastapi')
      }
    },
    onError: () => {
      setUrlResult({
        success: false, url: urlInput, symbol, title: null, description: null,
        site_name: null, extracted_text: null, analysis: null,
        data_quality: 'url_extracted_text_model1',
        errors: [{ error: 'Network error — check URL and try again.' }],
      })
    },
  })

  // ── Latest News query ──────────────────────────────────────────────────────
  const { data: newsData, isLoading: newsLoading, refetch: newsRefetch } = useQuery({
    queryKey: ['post-analyzer-news', symbol],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean
        items: SocialSignalItem[]
        errors: { source: string; error: string }[]
      }>(`/api/v1/social-signals?symbol=${symbol}&sources=finnhub&limit=5`)
      return res.data
    },
    enabled: activeMode === 'news',
    staleTime: 7 * 60_000,
    retry: 1,
  })

  // ── handlers ───────────────────────────────────────────────────────────────

  function analyzeNewsItem(item: SocialSignalItem) {
    const text = [item.headline, item.summary].filter(Boolean).join(' ')
    if (!text.trim()) return
    setInputText(text)
    setResult(null)
    setActiveMode('text')
    analyzeMutation.mutate({ text, symbol })
  }

  function handleCopyBrief() {
    if (!result) return
    const html = generateHtmlBrief(result, symbol)
    navigator.clipboard.writeText(html).then(() => {
      setCopiedBrief(true)
      setTimeout(() => setCopiedBrief(false), 2000)
    }).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = html
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopiedBrief(true)
      setTimeout(() => setCopiedBrief(false), 2000)
    })
  }

  function handleCopySummary() {
    if (!result) return
    const text = generateTextSummary(result, symbol)
    navigator.clipboard.writeText(text).then(() => {
      setCopiedSummary(true)
      setTimeout(() => setCopiedSummary(false), 2000)
    }).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopiedSummary(true)
      setTimeout(() => setCopiedSummary(false), 2000)
    })
  }

  const riskColor = result ? (RISK_COLOR[result.predicted_risk_label] ?? '#10b981') : '#64748b'
  const riskBg    = result ? (RISK_BG[result.predicted_risk_label]    ?? '#052e16') : '#1a1d27'
  const textForHighlight = (inputText || urlResult?.extracted_text || '').slice(0, 600)

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="社群交易風險分析" />

      <div className="p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">

        {/* ── Input card ── */}
        <div className="rounded-lg p-5" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert size={16} color="#ef4444" />
            <span className="text-sm font-semibold text-white">Social Trading Risk Analyzer</span>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: '#0d0f1a' }}>
            {([
              { id: 'text' as Mode, label: 'Text' },
              { id: 'url'  as Mode, label: 'URL' },
              { id: 'news' as Mode, label: 'Latest News' },
            ]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setActiveMode(id)}
                className="flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors"
                style={{
                  background: activeMode === id ? '#1a1d27' : 'transparent',
                  color:      activeMode === id ? '#f1f5f9' : '#64748b',
                  border:     activeMode === id ? '1px solid #2d3148' : '1px solid transparent',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ── TEXT MODE ── */}
          {activeMode === 'text' && (
            <>
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

              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs font-semibold flex-shrink-0" style={{ color: '#64748b' }}>標的</label>
                <TickerAutocomplete value={symbol} onChange={setSymbol} placeholder="GME, TSLA, AAPL..." className="w-48" />
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
            </>
          )}

          {/* ── URL MODE ── */}
          {activeMode === 'url' && (
            <>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs font-semibold flex-shrink-0" style={{ color: '#64748b' }}>標的</label>
                <TickerAutocomplete value={symbol} onChange={setSymbol} placeholder="GME, TSLA, AAPL..." className="w-48" />
              </div>

              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://finance.yahoo.com/news/…"
                className="w-full text-sm px-3 py-2.5 rounded-md outline-none mb-2"
                style={{ background: '#0d0f1a', border: '1px solid #2d3148', color: '#f1f5f9' }}
              />

              {urlInput && isHomepageUrl(urlInput) && (
                <p className="text-[11px] mb-2 px-2 py-1 rounded" style={{ background: '#451a03', color: '#fb923c', border: '1px solid #92400e' }}>
                  This appears to be a homepage. For better results, paste a direct article URL.
                </p>
              )}

              {urlResult && (
                <div className="rounded p-3 mb-3 text-xs" style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}>
                  {urlResult.site_name && (
                    <p className="font-semibold mb-0.5" style={{ color: '#38bdf8' }}>{urlResult.site_name}</p>
                  )}
                  {urlResult.title && (
                    <p className="text-white font-semibold mb-1">{urlResult.title}</p>
                  )}
                  {urlResult.description && (
                    <p style={{ color: '#94a3b8' }}>
                      {urlResult.description.slice(0, 200)}{urlResult.description.length > 200 ? '…' : ''}
                    </p>
                  )}
                  {urlResult.extracted_text && !articleMatchesTicker(urlResult.extracted_text, symbol) && (
                    <p className="mt-1.5 text-[11px]" style={{ color: '#f59e0b' }}>
                      The extracted article may not match the selected ticker.
                    </p>
                  )}
                  {!urlResult.success && urlResult.errors.length > 0 && (
                    <p className="mt-1.5" style={{ color: '#f87171' }}>
                      URL extraction failed: {urlResult.errors[0]?.error}
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => { setUrlResult(null); urlMutation.mutate({ url: urlInput.trim(), sym: symbol }) }}
                  disabled={!urlInput.trim() || urlMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-opacity disabled:opacity-40"
                  style={{ background: '#10b981', color: '#fff' }}
                >
                  {urlMutation.isPending
                    ? <><RefreshCw size={14} className="animate-spin" /> 抓取中…</>
                    : <><Globe size={14} /> Analyze URL</>
                  }
                </button>
              </div>
            </>
          )}

          {/* ── LATEST NEWS MODE ── */}
          {activeMode === 'news' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold flex-shrink-0" style={{ color: '#64748b' }}>標的</label>
                  <TickerAutocomplete value={symbol} onChange={setSymbol} placeholder="GME, TSLA, AAPL..." className="w-48" />
                </div>
                <button
                  onClick={() => newsRefetch()}
                  className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold"
                  style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
                >
                  <RefreshCw size={11} /> Refresh
                </button>
              </div>

              {newsLoading ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="h-20 animate-pulse rounded" style={{ background: '#2d3148' }} />
                  ))}
                </div>
              ) : !(newsData?.items?.length) ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <Newspaper size={20} color="#2d3148" />
                  <p className="text-xs" style={{ color: '#64748b' }}>No latest news available for {symbol}.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {newsData.items.map((item) => {
                    const labelColor = RISK_COLOR[item.ai_risk_label as keyof typeof RISK_COLOR] ?? '#64748b'
                    return (
                      <div key={item.id} className="rounded p-3" style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            {item.ai_risk_label && (
                              <span
                                className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{
                                  background: labelColor + '22',
                                  color: labelColor,
                                  border: `1px solid ${labelColor}55`,
                                }}
                              >
                                {item.ai_risk_label}
                              </span>
                            )}
                            {item.ai_risk_score != null && (
                              <span className="text-[11px]" style={{ color: '#94a3b8' }}>{item.ai_risk_score}</span>
                            )}
                          </div>
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2d3148', color: '#94a3b8' }}>
                            {item.source}
                          </span>
                        </div>

                        {item.headline && (
                          <p className="text-sm font-semibold text-white leading-snug mb-1">{item.headline}</p>
                        )}
                        {item.summary && (
                          <p className="text-xs mb-1.5" style={{ color: '#64748b' }}>
                            {item.summary.length > 120 ? item.summary.slice(0, 120) + '…' : item.summary}
                          </p>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono" style={{ color: '#475569' }}>
                            {formatUtc(item.published_at)}
                          </span>
                          <div className="flex items-center gap-2">
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs"
                                style={{ color: '#38bdf8' }}
                              >
                                ↗
                              </a>
                            )}
                            <button
                              onClick={() => analyzeNewsItem(item)}
                              className="text-xs px-2 py-0.5 rounded font-semibold"
                              style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
                            >
                              Analyze
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Results ── */}
        {result && (
          <div className="rounded-lg p-5 flex flex-col gap-5" style={{ background: riskBg, border: `1px solid ${riskColor}33` }}>

            {/* Risk label row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: '#64748b' }}>
                    Social Trading Risk
                  </span>
                  <span
                    className="text-lg font-bold px-4 py-1.5 rounded-full"
                    style={{ background: riskColor + '22', color: riskColor, border: `1px solid ${riskColor}` }}
                  >
                    {result.predicted_risk_label}
                  </span>
                </div>
                <span className="text-xs" style={{ color: '#64748b' }}>
                  {result.model_source} {apiSource === 'heuristic' && '(本地推論)'}
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
              <HighlightedText text={textForHighlight} terms={result.highlighted_terms} />
            </div>

            {/* Score meters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ScoreMeter label="FOMO 語言強度"  value={result.fomo_score / 100}                color="#a78bfa" />
              <ScoreMeter label="炒作語言強度"    value={result.hype_language_score / 100}       color={riskColor} />
              <ScoreMeter label="操縱信號強度"    value={result.manipulation_signal_score / 100} color="#f97316" />
              <ScoreMeter label="緊迫感強度"      value={result.urgency_score / 100}             color="#38bdf8" />
              <ScoreMeter label="Bullish sentiment (est.)" value={result.bullish_probability} color="#10b981" />
              <ScoreMeter label="Bearish sentiment (est.)" value={result.bearish_probability} color="#ef4444" />
            </div>
            <p className="text-[10px]" style={{ color: '#475569' }}>
              Directional sentiment is experimental and not a buy/sell signal.
            </p>

            {/* Short squeeze */}
            {result.short_squeeze_narrative_detected && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold"
                   style={{ background: '#450a0a', color: '#f87171', border: '1px solid #991b1b' }}>
                <Zap size={14} /> 偵測到軋空（Short Squeeze）敘事
              </div>
            )}

            {/* Explanation */}
            <div className="flex flex-col gap-1">
              <p className="text-[11px]" style={{ color: '#475569' }}>
                This model detects social-trading risk signals, not investment advice or fundamental valuation.
              </p>
              <div className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
                {result.explanation}
              </div>
            </div>

            {/* ── Risk Brief ── */}
            <div className="rounded-lg p-4" style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="text-xs font-semibold text-white">Social Trading Risk Brief</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopySummary}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors"
                    style={{
                      background: copiedSummary ? '#052e16' : '#2d3148',
                      color:      copiedSummary ? '#10b981' : '#94a3b8',
                      border:     `1px solid ${copiedSummary ? '#065f46' : '#3d4163'}`,
                    }}
                  >
                    {copiedSummary
                      ? <><Check size={11} /> Copied!</>
                      : <><Copy size={11} /> Copy Summary</>
                    }
                  </button>
                  <div className="flex flex-col items-end gap-0.5">
                    <button
                      onClick={handleCopyBrief}
                      className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold transition-colors"
                      style={{
                        background: copiedBrief ? '#052e16' : '#1e3a5f',
                        color:      copiedBrief ? '#10b981' : '#38bdf8',
                        border:     `1px solid ${copiedBrief ? '#065f46' : '#2d4a6f'}`,
                      }}
                    >
                      {copiedBrief
                        ? <><Check size={11} /> Copied!</>
                        : <><Copy size={11} /> Copy HTML</>
                      }
                    </button>
                    <span className="text-[9px]" style={{ color: '#475569' }}>For embedding in reports or web pages.</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 text-xs">
                {([
                  ['Ticker',       symbol],
                  ['Risk Label',   result.predicted_risk_label],
                  ['FOMO Score',   result.fomo_score.toFixed(0)],
                  ['Hype Score',   result.hype_language_score.toFixed(0)],
                  ['Manipulation', result.manipulation_signal_score.toFixed(0)],
                  ['Short Squeeze',result.short_squeeze_narrative_detected ? '⚠ Detected' : 'Not detected'],
                  ['Model Source', result.model_source],
                  ['Data Quality', result.data_quality],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label} className="flex justify-between py-1" style={{ borderBottom: '1px solid #1a1d27' }}>
                    <span style={{ color: '#64748b' }}>{label}</span>
                    <span
                      className="font-mono text-right ml-2 truncate max-w-[140px]"
                      style={{ color: label === 'Risk Label' ? riskColor : '#f1f5f9' }}
                    >
                      {val}
                    </span>
                  </div>
                ))}
              </div>

              {result.highlighted_terms.length > 0 && (
                <p className="text-[10px] mt-2">
                  <span style={{ color: '#64748b' }}>Key Terms: </span>
                  <span style={{ color: '#a78bfa' }}>{result.highlighted_terms.join(', ')}</span>
                </p>
              )}

              <p className="text-xs mt-2" style={{ color: '#64748b' }}>
                {MONITORING_ACTIONS[result.predicted_risk_label]}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
