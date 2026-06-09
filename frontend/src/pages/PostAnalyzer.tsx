import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  ShieldAlert, Send, Zap, CheckCircle,
  Globe, Copy, Check, RefreshCw, Newspaper, ChevronDown, ChevronUp, TrendingUp,
} from 'lucide-react'
import { phpPost } from '../api/phpClient'
import { api } from '../api/client'
import { personalApi } from '../api/personalApiClient'
import { TopBar } from '../components/layout/TopBar'
import { TickerAutocomplete } from '../components/TickerAutocomplete'
import { SAMPLE_POSTS } from '../data/samplePosts'
import type { SamplePost } from '../data/samplePosts'

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
  model_id?: string | null
  model_trained_at?: string | null
  direction_label?: string | null
  direction_probabilities?: Record<string, number> | null
}

interface UrlAnalysisResult {
  success: boolean
  url: string
  source_url: string
  symbol: string
  title: string | null
  extracted_title: string | null
  description: string | null
  extracted_description: string | null
  site_name: string | null
  extracted_text: string | null
  analyzed_text: string | null
  extraction_quality: 'partial_article_text' | 'title_description_only' | null
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
  model_source?: string | null
  data_quality?: string | null
  risk_confidence?: number | null
  risk_probabilities?: Record<string, number> | null
  direction_label?: string | null
  direction_confidence?: number | null
}

interface EventArResult {
  success: boolean
  symbol: string
  event_date: string
  benchmark?: string
  method?: string
  alpha?: number | null
  beta?: number | null
  estimation_days?: number
  event_window_days?: number
  event_abnormal_return?: number | null
  car_3d?: number | null
  car_5d?: number | null
  available_days?: number
  risk_level?: 'low' | 'medium' | 'high'
  interpretation?: string
  data_quality?: string
  disclaimer?: string
  error?: string
}

interface SocialSummary {
  source: string
  reddit_mentions: number
  twitter_mentions: number
  reddit_sentiment: number
  twitter_sentiment: number
  total_mentions: number
  avg_social_sentiment: number
  social_buzz_score: number
  risk_hint: string
  data_quality: string
  available?: boolean
}

type Mode = 'text' | 'url' | 'news' | 'samples'

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
  const totalHits  = hypeHits.length + fomoHits.length + manipHits.length + (squeezeHit ? 1 : 0)
  const sentiment  = totalHits === 0 ? 0.5 : (hypeHits.length > 0 ? 0.7 : 0.4)
  const bullish    = sentiment
  const bearish    = 1 - bullish

  const composite = hypeScore * 0.3 + fomoScore * 0.3 + manipScore * 0.25 + (squeezeHit ? 30 : 0) * 0.15
  const label: AnalyzeResult['predicted_risk_label'] =
    composite >= 70 ? 'Critical' :
    composite >= 45 ? 'High' :
    composite >= 20 ? 'Medium' : 'Low'

  const highlighted = [...hypeHits, ...fomoHits, ...(squeezeHit ? ['short squeeze'] : []), ...manipHits]
  const riskZh: Record<string, string> = { Critical: '極高風險', High: '高風險', Medium: '中度風險', Low: '低風險' }
  return {
    sentiment_score: sentiment, bullish_probability: bullish, bearish_probability: bearish,
    fomo_score: fomoScore, hype_language_score: hypeScore, manipulation_signal_score: manipScore,
    urgency_score: urgency, short_squeeze_narrative_detected: squeezeHit,
    predicted_risk_label: label,
    explanation: `此結果為單篇文本中的社群風險語言強度判斷（${riskZh[label]}）。偵測到炒作詞彙 ${hypeHits.length} 個、FOMO 詞彙 ${fomoHits.length} 個${squeezeHit ? '，並含有軋空敘事' : ''}。本結果不代表股票投資價值或價格走勢。`,
    highlighted_terms: [...new Set(highlighted)],
    model_source: 'keyword_heuristic_v0.1', data_quality: 'heuristic',
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

const RISK_COLOR = { Critical: '#ef4444', High: '#f97316', Medium: '#f59e0b', Low: '#10b981' }
const RISK_BG    = { Critical: '#450a0a', High: '#431407', Medium: '#451a03', Low: '#052e16' }

// ── 安全建議措辭（不含任何買賣、持倉、出場、停損等操作建議）─────────────────
const MONITORING_ACTIONS: Record<string, string> = {
  Critical: '⚠ 極高警戒：此文本偵測到高度社群操縱與 FOMO 訊號。建議交叉查證官方公告、財報與多篇新聞來源，檢查資訊來源是否可信，依自身風險承受能力審慎判斷。不應僅依據單篇文章做任何投資決策。',
  High:     '⚡ 高度警戒：此文本含有明顯炒作語言與操縱訊號。注意社群炒作與資訊操縱風險，觀察成交量、波動率與多來源訊號是否同步升高，不應僅依賴單一文章做投資判斷。',
  Medium:   '👁 中度警戒：此文本偵測到部分 FOMO 語言。可加入觀察清單持續追蹤，並觀察多來源訊號是否持續升高。建議查證資訊來源可信度。',
  Low:      '✓ 低度警戒：此文本目前未偵測到顯著社群風險語言。建議仍持續查證資訊來源，關注後續多來源訊號變化。',
}

// ── localization helpers ──────────────────────────────────────────────────────

function getLocalizedModelExplanation(res: AnalyzeResult): string {
  const sq = res.short_squeeze_narrative_detected ? '本文本中亦偵測到軋空敘事。' : ''
  const map: Record<string, string> = {
    Low:      `系統判定此文本目前未呈現顯著的社群交易風險語言。${sq}此判斷基於文本特徵與模型輸出，仍應配合來源查證與多來源資訊觀察。`,
    Medium:   `系統判定此文本出現部分社群風險語言訊號，建議留意 FOMO、炒作或急迫語氣是否持續升高。${sq}`,
    High:     `系統判定此文本具有明顯社群風險語言訊號，建議優先查證來源並避免僅依單篇內容形成判斷。${sq}`,
    Critical: `系統判定此文本具有高度社群炒作或操縱風險語言訊號，建議進行多來源交叉查證。${sq}`,
  }
  return map[res.predicted_risk_label] ?? res.explanation
}

const MODEL_SOURCE_ZH: Record<string, string> = {
  'colab_text_model':           'Colab Text Model',
  'real_model':                 'Legacy ML 模型',
  'heuristic_fallback':         '關鍵字啟發式分析',
  'real_ai_v2_post_risk_model': 'Real AI v2 貼文風險模型',
  'keyword_heuristic_v0.1':    '關鍵字啟發式分析 v0.1',
}
function getFriendlyModelSource(s: string): string {
  return MODEL_SOURCE_ZH[s] ?? s
}

const DATA_QUALITY_ZH: Record<string, string> = {
  'real_reddit_yfinance_weak_label': 'Reddit 與市場資料弱標籤訓練資料',
  'heuristic':                       '啟發式分析（本地推論）',
  'demo':                            '展示模式',
  'url_extracted_text_model1':       'URL 擷取文本（Model 1）',
}
function getFriendlyDataQuality(s: string): string {
  return DATA_QUALITY_ZH[s] ?? s
}

function getConsistencyWarnings(res: AnalyzeResult, sample: SamplePost | null): string[] {
  const ws: string[] = []
  if (sample && sample.expectedRisk !== res.predicted_risk_label) {
    ws.push('模型一致性提醒：此範例的參考標籤與模型預測不同。此案例應列入模型檢核，不宜直接作為模型成效展示依據。')
  }
  if (res.predicted_risk_label === 'Low' && res.short_squeeze_narrative_detected) {
    ws.push('局部訊號提醒：此文本偵測到軋空敘事，但整體模型分級仍為低風險。建議人工檢視文本內容與各項指標。')
  }
  return ws
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
    '社群交易風險文本分析摘要',
    `標的：${sym}`,
    `單篇文本社群風險語言強度：${riskLabelZh(res.predicted_risk_label)}`,
    `FOMO 語言強度：${res.fomo_score.toFixed(0)}`,
    `炒作語言強度：${res.hype_language_score.toFixed(0)}`,
    `操縱訊號強度：${res.manipulation_signal_score.toFixed(0)}`,
    `軋空敘事：${res.short_squeeze_narrative_detected ? '已偵測' : '未偵測'}`,
    `模型來源：${res.model_source}`,
    '',
    '【單篇文本分析聲明】',
    '本結果僅代表該文本中的社群交易風險訊號，不代表該股票本身的投資價值或價格走勢。',
    '',
    '【方法與限制】',
    '基於 FOMO、炒作語言、操縱訊號、軋空敘事等文本特徵進行演算法分析。無法覆蓋基本面、財報、總體經濟或機構研究資訊。',
    '',
    '【非投資建議聲明】',
    '本報告由 Social Trading Risk Copilot 自動生成，僅用於分析單篇文本中的社群交易風險訊號。本報告不構成投資建議、買賣建議、持倉建議或財務顧問服務。使用者不應僅依據單篇文章或本分析結果做出投資決策。',
  ].join('\n')
}

function generateHtmlBrief(res: AnalyzeResult, sym: string, sourceText: string, warnings: string[]): string {
  const now          = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const color        = RISK_COLOR[res.predicted_risk_label] ?? '#64748b'
  const eSym         = escapeHtml(sym)
  const eLabel       = escapeHtml(riskLabelZh(res.predicted_risk_label))
  const eModel       = escapeHtml(res.model_source)
  const eModelZh     = escapeHtml(getFriendlyModelSource(res.model_source))
  const eQuality     = escapeHtml(res.data_quality)
  const eQualityZh   = escapeHtml(getFriendlyDataQuality(res.data_quality))
  const eExplanation = escapeHtml(res.explanation)
  const eLocalExpl   = escapeHtml(getLocalizedModelExplanation(res))
  const eAction      = escapeHtml(MONITORING_ACTIONS[res.predicted_risk_label] ?? '')
  const eSourceText  = sourceText.trim() ? escapeHtml(sourceText.slice(0, 1200)) : '（無可用原始文本）'
  const eNow         = escapeHtml(now)
  const clamp       = (v: number) => Math.min(100, Math.max(0, v)).toFixed(0)
  const fomoW       = clamp(res.fomo_score)
  const hypeW       = clamp(res.hype_language_score)
  const manipW      = clamp(res.manipulation_signal_score)
  const urgencyW    = clamp(res.urgency_score)
  const dp          = res.direction_probabilities
  const bullW       = clamp((dp ? (dp['bullish'] ?? 0) : res.bullish_probability) * 100)
  const bearW       = clamp((dp ? (dp['bearish'] ?? 0) : res.bearish_probability) * 100)
  const neutralW    = dp ? clamp((dp['neutral'] ?? 0) * 100) : null
  const squeezeHtml = res.short_squeeze_narrative_detected
    ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#450a0a;color:#f87171;font-size:0.75rem;border:1px solid #991b1b;">⚠ 已偵測</span>'
    : '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#1a1d27;color:#64748b;font-size:0.75rem;border:1px solid #2d3148;">未偵測</span>'
  const mkBar = (label: string, pct: string, c: string) =>
    `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:0.75rem;margin-bottom:3px;">
        <span style="color:#94a3b8;">${escapeHtml(label)}</span>
        <span style="color:${c};font-family:monospace;">${pct}</span>
      </div>
      <div style="background:#2d3148;border-radius:4px;height:6px;">
        <div style="width:${pct}%;background:${c};height:6px;border-radius:4px;max-width:100%;"></div>
      </div>
    </div>`
  const barsHtml = [
    mkBar('FOMO 語言強度',  fomoW,    '#a78bfa'),
    mkBar('炒作語言強度',   hypeW,    color),
    mkBar('操縱訊號強度',   manipW,   '#f97316'),
    mkBar('緊迫感強度',     urgencyW, '#38bdf8'),
    mkBar('方向性情緒：看多', bullW,  '#10b981'),
    mkBar('方向性情緒：看空', bearW,  '#ef4444'),
    ...(neutralW !== null ? [mkBar('方向性情緒：中性', neutralW, '#94a3b8')] : []),
  ].join('\n')
  const termsHtml = res.highlighted_terms.length > 0
    ? res.highlighted_terms.map(t => `<mark style="background:#451a03;color:#fb923c;padding:1px 4px;border-radius:3px;margin:2px;">${escapeHtml(t)}</mark>`).join(' ')
    : '<span style="color:#475569;">（無）</span>'
  const warningsHtml = warnings.length > 0
    ? warnings.map(w => `<div style="margin:6px 0;padding:8px 12px;background:#451a03;border:1px solid #78350f;border-radius:6px;font-size:0.75rem;color:#fbbf24;line-height:1.5;">⚠ ${escapeHtml(w)}</div>`).join('\n')
    : ''

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>單篇文本分析報告：${eSym} — Social Trading Risk Copilot</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{background:#0d0f1a;color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:24px 16px;}
.card{max-width:680px;margin:0 auto;background:#1a1d27;border:1px solid #2d3148;border-radius:10px;overflow:hidden;}
.card-header{padding:18px 20px 14px;border-bottom:1px solid #2d3148;}
.card-header h1{font-size:0.95rem;font-weight:700;color:#f1f5f9;margin-bottom:3px;}
.card-header .sub{font-size:0.7rem;color:#64748b;}
.risk-badge{display:inline-block;padding:4px 16px;border-radius:20px;font-size:1rem;font-weight:700;margin-top:8px;}
.tabs{display:flex;gap:0;border-bottom:1px solid #2d3148;background:#0d0f1a;}
.tab{padding:9px 14px;font-size:0.75rem;font-weight:600;cursor:pointer;color:#64748b;background:transparent;border:none;border-bottom:2px solid transparent;transition:color 0.15s;}
.tab.active{color:#38bdf8;border-bottom:2px solid #38bdf8;}
.tab:hover{color:#94a3b8;}
.tab-content{padding:18px 20px;}
.kv-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;}
.kv-row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1a1d27;font-size:0.8rem;}
.kv-row .k{color:#64748b;}
.kv-row .v{font-family:monospace;color:#f1f5f9;text-align:right;}
.action-box{margin-top:14px;padding:10px 12px;background:#0d0f1a;border-radius:6px;font-size:0.78rem;color:#f59e0b;border:1px solid #451a03;line-height:1.5;}
.raw-text{font-size:0.75rem;line-height:1.7;color:#94a3b8;white-space:pre-wrap;word-break:break-word;background:#0d0f1a;padding:12px;border-radius:6px;border:1px solid #2d3148;max-height:320px;overflow-y:auto;}
.disclaimer{font-size:0.7rem;color:#64748b;line-height:1.6;margin-top:8px;}
.disclaimer strong{color:#94a3b8;}
.footer{font-size:0.65rem;color:#334155;text-align:center;padding:10px 20px;border-top:1px solid #1a1d27;}
</style>
</head>
<body>
<div class="card">
  <div class="card-header">
    <h1>單篇文本分析報告 — Social Trading Risk Copilot</h1>
    <div class="sub">產生時間：${eNow} UTC &nbsp;·&nbsp; 標的：${eSym}</div>
    <div style="margin-top:6px;">
      <span class="risk-badge" style="background:${color}22;color:${color};border:1px solid ${color};">${eLabel}</span>
      <span style="font-size:0.68rem;color:#475569;margin-left:10px;">此為單篇文本社群風險語言強度，不代表股票投資價值。</span>
    </div>
  </div>

  <div class="tabs">
    <button class="tab active" onclick="showTab('summary',this)">摘要</button>
    <button class="tab" onclick="showTab('indicators',this)">風險指標</button>
    <button class="tab" onclick="showTab('rawtext',this)">原始文本</button>
    <button class="tab" onclick="showTab('explain',this)">模型解釋</button>
    <button class="tab" onclick="showTab('method',this)">方法與限制</button>
  </div>

  <div id="tab-summary" class="tab-content">
    <div class="kv-grid">
      <div class="kv-row"><span class="k">標的</span><span class="v">${eSym}</span></div>
      <div class="kv-row"><span class="k">文本社群風險語言強度</span><span class="v" style="color:${color};font-weight:700;">${eLabel}</span></div>
      <div class="kv-row"><span class="k">FOMO 語言強度</span><span class="v">${fomoW}</span></div>
      <div class="kv-row"><span class="k">炒作語言強度</span><span class="v">${hypeW}</span></div>
      <div class="kv-row"><span class="k">操縱訊號強度</span><span class="v">${manipW}</span></div>
      <div class="kv-row"><span class="k">軋空敘事</span><span class="v">${squeezeHtml}</span></div>
      <div class="kv-row"><span class="k">模型來源</span><span class="v">${eModelZh}</span></div>
      <div class="kv-row"><span class="k">資料品質</span><span class="v">${eQualityZh}</span></div>
    </div>
    ${res.highlighted_terms.length > 0 ? `<div style="margin-top:12px;font-size:0.78rem;"><span style="color:#64748b;">關鍵詞彙：</span><span style="margin-left:6px;">${termsHtml}</span></div>` : ''}
    <div class="action-box">${eAction}</div>
    ${warningsHtml}
  </div>

  <div id="tab-indicators" class="tab-content" style="display:none;">
    ${barsHtml}
    <p style="font-size:0.7rem;color:#475569;margin-top:8px;">方向性情緒僅為文字語氣估計，不代表買賣建議。</p>
  </div>

  <div id="tab-rawtext" class="tab-content" style="display:none;">
    <p style="font-size:0.75rem;color:#64748b;margin-bottom:8px;">以下為輸入分析的原始文本內容（最多 1200 字元）：</p>
    <div class="raw-text">${eSourceText}</div>
  </div>

  <div id="tab-explain" class="tab-content" style="display:none;">
    <p style="font-size:0.8rem;color:#94a3b8;line-height:1.6;margin-bottom:10px;">${eLocalExpl}</p>
    ${warningsHtml}
    <div style="margin-top:12px;padding:10px;background:#0a0c14;border-radius:6px;border:1px solid #1a1d27;">
      <p style="font-size:0.65rem;color:#475569;margin-bottom:4px;">模型原始輸出（英文）：</p>
      <p style="font-size:0.72rem;color:#334155;line-height:1.5;">${eExplanation}</p>
    </div>
  </div>

  <div id="tab-method" class="tab-content" style="display:none;">
    <p class="disclaimer"><strong>方法與限制：</strong>本分析基於 FOMO、炒作語言、操縱訊號、軋空敘事等文本特徵進行演算法評估。無法覆蓋基本面、財報、總體經濟或機構研究資訊。分析結果因輸入文本品質而有所差異，不應作為投資決策的唯一依據。</p>
    <p class="disclaimer" style="margin-top:10px;"><strong>非投資建議聲明：</strong>本報告由 Social Trading Risk Copilot 自動生成，僅用於分析單篇文本中的社群交易風險訊號，例如 FOMO、炒作語言、操縱訊號與軋空敘事。本報告不構成投資建議、買賣建議、持倉建議或財務顧問服務。使用者不應僅依據單篇文章或本分析結果做出投資決策。</p>
    <p class="disclaimer" style="margin-top:10px;"><strong>技術資訊：</strong>模型來源代碼：${eModel}；資料品質代碼：${eQuality}</p>
  </div>

  <div class="footer">Social Trading Risk Copilot · ${eNow} UTC · 僅供社群風險語言分析，非投資建議</div>
</div>
<script>
function showTab(name,btn){
  document.querySelectorAll('[id^="tab-"]').forEach(function(el){el.style.display='none';});
  document.querySelectorAll('.tab').forEach(function(el){el.classList.remove('active');});
  document.getElementById('tab-'+name).style.display='block';
  btn.classList.add('active');
}
</script>
</body>
</html>`
}

// ── risk label ZH ─────────────────────────────────────────────────────────────

const RISK_LABEL_ZH: Record<string, string> = {
  Critical: '極高風險', High: '高風險', Medium: '中度風險', Low: '低風險',
}
function riskLabelZh(label: string | null | undefined): string {
  return RISK_LABEL_ZH[label ?? ''] ?? label ?? '—'
}

// ── report helpers ─────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function generateChineseSummary(res: AnalyzeResult, sym: string, warnings: string[]): string {
  const localExpl = getLocalizedModelExplanation(res)
  const warnLines = warnings.length > 0 ? ['', '【模型提醒】', ...warnings] : []
  return [
    '社群交易風險文本分析摘要',
    `標的：${sym}`,
    `單篇文本社群風險語言強度：${riskLabelZh(res.predicted_risk_label)}`,
    `FOMO 語言強度：${res.fomo_score.toFixed(0)}`,
    `炒作語言強度：${res.hype_language_score.toFixed(0)}`,
    `操縱訊號強度：${res.manipulation_signal_score.toFixed(0)}`,
    `軋空敘事：${res.short_squeeze_narrative_detected ? '已偵測' : '未偵測'}`,
    `模型來源：${getFriendlyModelSource(res.model_source)}`,
    `資料品質：${getFriendlyDataQuality(res.data_quality)}`,
    `中文解釋：${localExpl}`,
    ...warnLines,
    '',
    '【單篇文本分析聲明】',
    '本結果僅代表該文本中的社群交易風險訊號，不代表該股票本身的投資價值或價格走勢。',
    '',
    '【方法與限制】',
    '基於 FOMO、炒作語言、操縱訊號、軋空敘事等文本特徵進行演算法分析。無法覆蓋基本面、財報、總體經濟或機構研究資訊。分析結果因輸入文本品質而有所差異。',
    '',
    '【非投資建議聲明】',
    '本報告由 Social Trading Risk Copilot 自動生成，僅用於分析單篇文本中的社群交易風險訊號，例如 FOMO、炒作語言、操縱訊號與軋空敘事。本報告不構成投資建議、買賣建議、持倉建議或財務顧問服務。使用者不應僅依據單篇文章或本分析結果做出投資決策。',
  ].join('\n')
}

function downloadWordReport(res: AnalyzeResult, sym: string, warnings: string[]) {
  const now       = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const color     = RISK_COLOR[res.predicted_risk_label] ?? '#10b981'
  const localExpl = getLocalizedModelExplanation(res)
  const rows  = [
    ['標的',                 escapeHtml(sym)],
    ['文本社群風險語言強度',  `<span style="color:${color};font-weight:bold;">${escapeHtml(riskLabelZh(res.predicted_risk_label))}</span>`],
    ['FOMO 語言強度',         res.fomo_score.toFixed(0)],
    ['炒作語言強度',          res.hype_language_score.toFixed(0)],
    ['操縱訊號強度',          res.manipulation_signal_score.toFixed(0)],
    ['緊迫感強度',            res.urgency_score.toFixed(0)],
    ['軋空敘事',              res.short_squeeze_narrative_detected ? '已偵測' : '未偵測'],
    ['模型來源',              escapeHtml(getFriendlyModelSource(res.model_source))],
    ['資料品質',              escapeHtml(getFriendlyDataQuality(res.data_quality))],
    ['關鍵詞彙',              res.highlighted_terms.length > 0 ? escapeHtml(res.highlighted_terms.join(', ')) : '—'],
    ['中文解釋',              escapeHtml(localExpl)],
  ]
  const tableRows = rows.map(([k, v]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#555;width:160px;">${k}</td><td style="padding:6px 0;">${v}</td></tr>`
  ).join('')
  const warningsHtml = warnings.length > 0
    ? `<div style="margin-top:14px;"><h3 style="font-size:13px;color:#92400e;margin-bottom:6px;">模型提醒</h3>${warnings.map(w => `<p style="font-size:12px;color:#92400e;margin:4px 0;padding:6px 10px;background:#fffbeb;border-left:3px solid #f59e0b;">${escapeHtml(w)}</p>`).join('')}</div>`
    : ''
  const html = `<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;padding:32px;">
<h2 style="color:#c00;">社群交易風險文本分析報告</h2>
<p style="color:#888;font-size:12px;">產生時間：${now} UTC &nbsp;·&nbsp; Social Trading Risk Copilot</p>
<p style="font-size:12px;color:#555;margin-bottom:4px;"><strong>本結果僅代表該文本中的社群交易風險訊號，不代表該股票本身的投資價值或價格走勢。</strong></p>
<table style="border-collapse:collapse;font-size:14px;margin-top:16px;">${tableRows}</table>
${warningsHtml}
<hr style="margin-top:20px;border:none;border-top:1px solid #ddd;" />
<h3 style="font-size:13px;color:#555;margin-top:16px;">方法與限制</h3>
<p style="font-size:12px;color:#777;">本分析基於 FOMO、炒作語言、操縱訊號、軋空敘事等文本特徵進行演算法評估。無法覆蓋基本面、財報、總體經濟或機構研究資訊。分析結果因輸入文本品質而有所差異，不應作為投資決策的唯一依據。</p>
<h3 style="font-size:13px;color:#555;margin-top:12px;">非投資建議聲明</h3>
<p style="font-size:12px;color:#777;">本報告由 Social Trading Risk Copilot 自動生成，僅用於分析單篇文本中的社群交易風險訊號，例如 FOMO、炒作語言、操縱訊號與軋空敘事。本報告不構成投資建議、買賣建議、持倉建議或財務顧問服務。使用者不應僅依據單篇文章或本分析結果做出投資決策。</p>
</body></html>`
  const blob = new Blob(['﻿' + html], { type: 'application/msword' })
  const a    = document.createElement('a')
  a.href     = URL.createObjectURL(blob)
  a.download = `social-risk-brief-${sym}.doc`
  a.click()
  URL.revokeObjectURL(a.href)
}

function printReport(res: AnalyzeResult, sym: string, warnings: string[]) {
  const now       = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const color     = RISK_COLOR[res.predicted_risk_label] ?? '#10b981'
  const localExpl = getLocalizedModelExplanation(res)
  const rows  = [
    ['標的',                 escapeHtml(sym)],
    ['文本社群風險語言強度',  `<span style="color:${color};font-weight:bold;">${escapeHtml(riskLabelZh(res.predicted_risk_label))}</span>`],
    ['FOMO 語言強度',         res.fomo_score.toFixed(0)],
    ['炒作語言強度',          res.hype_language_score.toFixed(0)],
    ['操縱訊號強度',          res.manipulation_signal_score.toFixed(0)],
    ['緊迫感強度',            res.urgency_score.toFixed(0)],
    ['軋空敘事',              res.short_squeeze_narrative_detected ? '已偵測' : '未偵測'],
    ['模型來源',              escapeHtml(getFriendlyModelSource(res.model_source))],
    ['關鍵詞彙',              res.highlighted_terms.length > 0 ? escapeHtml(res.highlighted_terms.join(', ')) : '—'],
    ['中文解釋',              escapeHtml(localExpl)],
  ]
  const tableRows = rows.map(([k, v]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#555;width:180px;vertical-align:top;">${k}</td><td>${v}</td></tr>`
  ).join('')
  const warningsHtml = warnings.length > 0
    ? `<div style="margin-top:14px;"><h3 style="font-size:13px;color:#92400e;margin-bottom:6px;">模型提醒</h3>${warnings.map(w => `<p style="font-size:12px;color:#92400e;margin:4px 0;padding:6px 10px;background:#fffbeb;border-left:3px solid #f59e0b;">${escapeHtml(w)}</p>`).join('')}</div>`
    : ''
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>風險報告 ${escapeHtml(sym)}</title>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#111;}h2{color:#c00;}h3{color:#555;font-size:13px;}table{border-collapse:collapse;font-size:14px;}p.disclaimer{font-size:12px;color:#777;}hr{border:none;border-top:1px solid #ddd;margin:16px 0;}@media print{.no-print{display:none}}</style>
</head><body>
<h2>社群交易風險文本分析報告</h2>
<p style="color:#888;font-size:12px;">產生時間：${now} UTC · Social Trading Risk Copilot</p>
<p style="font-size:12px;color:#555;"><strong>本結果僅代表該文本中的社群交易風險訊號，不代表該股票本身的投資價值或價格走勢。</strong></p>
<table>${tableRows}</table>
${warningsHtml}
<hr/>
<h3>方法與限制</h3>
<p class="disclaimer">本分析基於 FOMO、炒作語言、操縱訊號、軋空敘事等文本特徵進行演算法評估。無法覆蓋基本面、財報、總體經濟或機構研究資訊。分析結果因輸入文本品質而有所差異，不應作為投資決策的唯一依據。</p>
<h3>非投資建議聲明</h3>
<p class="disclaimer">本報告由 Social Trading Risk Copilot 自動生成，僅用於分析單篇文本中的社群交易風險訊號，例如 FOMO、炒作語言、操縱訊號與軋空敘事。本報告不構成投資建議、買賣建議、持倉建議或財務顧問服務。使用者不應僅依據單篇文章或本分析結果做出投資決策。</p>
<div class="no-print" style="margin-top:24px;"><button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;">列印 / 另存 PDF</button></div>
</body></html>`)
  win.document.close()
  setTimeout(() => win.print(), 400)
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
  const [urlInput, setUrlInput]           = useState('')
  const [urlResult, setUrlResult]         = useState<UrlAnalysisResult | null>(null)
  const [urlAnalyzedText, setUrlAnalyzedText] = useState('')

  // Brief
  const [copiedSummary, setCopiedSummary] = useState(false)

  // Samples
  const [sampleFilter,   setSampleFilter]   = useState<'All' | 'Critical' | 'High' | 'Medium' | 'Low'>('All')
  const [currentSample,  setCurrentSample]  = useState<SamplePost | null>(null)

  // Indicators panel
  const [showIndicators, setShowIndicators] = useState(false)
  const [showTechInfo,   setShowTechInfo]   = useState(false)

  // Event abnormal return (eventDate is intentionally empty — user must supply it explicitly)
  const [eventDate,     setEventDate]     = useState('')
  const [eventArResult, setEventArResult] = useState<EventArResult | null>(null)

  // ── analyzeMutation (UNCHANGED) ────────────────────────────────────────────
  const analyzeMutation = useMutation({
    mutationFn: async (req: AnalyzeRequest): Promise<AnalyzeResult> => {
      try {
        const res = await personalApi.post<AnalyzeResult>('/api/v1/post-analyze', req)
        return res.data
      } catch (err) {
        console.error('[Real AI API failed, fallback to heuristic]', err)
        return heuristicAnalyze(req.text)
      }
    },
    onSuccess: async (data, vars) => {
      setUrlAnalyzedText('')
      setResult(data)
      setEventArResult(null)
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
      setUrlAnalyzedText(data.analyzed_text || data.extracted_text || data.description || data.title || '')
      if (data.analysis) {
        setResult(data.analysis)
        setApiSource('fastapi')
      }
    },
    onError: () => {
      setUrlResult({
        success: false, url: urlInput, source_url: urlInput, symbol,
        title: null, extracted_title: null, description: null, extracted_description: null,
        site_name: null, extracted_text: null, analyzed_text: null, extraction_quality: null, analysis: null,
        data_quality: 'url_extracted_text_model1',
        errors: [{ error: 'Network error — check URL and try again.' }],
      })
    },
  })

  // ── Event abnormal return mutation ────────────────────────────────────────
  const eventArMutation = useMutation({
    mutationFn: async (): Promise<EventArResult | null> => {
      if (!eventDate) {
        setEventArResult(null)
        return null
      }
      const res = await personalApi.post<EventArResult>('/api/v1/event-abnormal-return', {
        symbol,
        event_date: eventDate,
        benchmark:  'SPY',
        estimation_days:   120,
        event_window_days: 5,
      })
      return res.data
    },
    onSuccess: (data) => { if (data) setEventArResult(data) },
  })

  // ── Latest News query ──────────────────────────────────────────────────────
  const { data: newsData, isLoading: newsLoading, refetch: newsRefetch } = useQuery({
    queryKey: ['post-analyzer-news', symbol],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean
        symbol?: string
        items: SocialSignalItem[]
        social_summary?: SocialSummary
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

  function handleDownloadHtml() {
    if (!result) return
    const sourceText = inputText || urlResult?.extracted_text || ''
    const html = generateHtmlBrief(result, symbol, sourceText, getConsistencyWarnings(result, currentSample))
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `social-risk-text-analysis-${symbol}.html`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function handleCopySummary() {
    if (!result) return
    const text = generateChineseSummary(result, symbol, getConsistencyWarnings(result, currentSample))
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
  // urlAnalyzedText is set from URL analysis and cleared on text analysis,
  // so it correctly takes priority over stale inputText left by analyzeNewsItem()
  const textForHighlight = (urlAnalyzedText || inputText || '').slice(0, 600)

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="社群交易風險文本分析器" />

      <div className="p-6 flex flex-col gap-6 max-w-4xl mx-auto w-full">

        {/* ── Input card ── */}
        <div className="rounded-lg p-5" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex flex-col gap-0.5 mb-4">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} color="#ef4444" />
              <span className="text-sm font-semibold text-white">社群交易風險分析器</span>
            </div>
            <p className="text-xs ml-6" style={{ color: '#64748b' }}>
              偵測貼文、新聞或連結中的 FOMO、炒作語言、操縱訊號與軋空敘事。
            </p>
          </div>

          {/* Mode tabs */}
          <div className="flex gap-1 mb-5 p-1 rounded-lg" style={{ background: '#0d0f1a' }}>
            {([
              { id: 'text'    as Mode, label: '文字分析' },
              { id: 'url'     as Mode, label: '連結分析' },
              { id: 'news'    as Mode, label: '最新新聞' },
              { id: 'samples' as Mode, label: '範例資料庫' },
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
                  這看起來像首頁。為了提高準確度，建議貼上單篇新聞或文章連結。
                </p>
              )}

              {urlResult && (
                <div className="rounded p-3 mb-3 text-xs" style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}>
                  {urlResult.site_name && (
                    <p className="font-semibold mb-0.5" style={{ color: '#38bdf8' }}>{urlResult.site_name}</p>
                  )}
                  {urlResult.extracted_title && (
                    <p className="text-white font-semibold mb-1">{urlResult.extracted_title}</p>
                  )}
                  {urlResult.extracted_description && (
                    <p style={{ color: '#94a3b8' }}>
                      {urlResult.extracted_description.slice(0, 200)}{urlResult.extracted_description.length > 200 ? '…' : ''}
                    </p>
                  )}
                  {urlResult.analyzed_text && (
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid #1a1d27' }}>
                      <p className="mb-0.5" style={{ color: '#475569' }}>實際送入模型的文字：</p>
                      <p className="font-mono leading-relaxed" style={{ color: '#64748b', wordBreak: 'break-word' }}>
                        {urlResult.analyzed_text.slice(0, 300)}{urlResult.analyzed_text.length > 300 ? '…' : ''}
                      </p>
                    </div>
                  )}
                  {urlResult.extraction_quality === 'title_description_only' && (
                    <p className="mt-1.5 text-[11px]" style={{ color: '#f59e0b' }}>
                      此網站限制全文擷取，目前僅使用標題與摘要進行分析。
                    </p>
                  )}
                  {urlResult.extraction_quality === 'partial_article_text' && (
                    <p className="mt-1.5 text-[11px]" style={{ color: '#10b981' }}>
                      已擷取部分文章文字進行分析。
                    </p>
                  )}
                  {urlResult.extracted_text && !articleMatchesTicker(urlResult.extracted_text, symbol) && (
                    <p className="mt-1.5 text-[11px]" style={{ color: '#f59e0b' }}>
                      擷取到的文章內容可能與目前選擇的標的不完全相符，請確認連結是否正確。
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

          {/* ── SAMPLES MODE ── */}
          {activeMode === 'samples' && (
            <>
              <p className="text-[10px] mb-2" style={{ color: '#475569' }}>
                範例資料為展示模型行為的合成／整理資料，非即時社群資料。
              </p>
              <div className="flex gap-1 mb-3 flex-wrap">
                {(['All','Critical','High','Medium','Low'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setSampleFilter(f)}
                    className="text-xs px-2 py-0.5 rounded font-semibold transition-colors"
                    style={{
                      background: sampleFilter === f ? '#2d3148' : 'transparent',
                      color:      sampleFilter === f ? '#f1f5f9' : '#64748b',
                      border:     `1px solid ${sampleFilter === f ? '#3d4163' : 'transparent'}`,
                    }}
                  >
                    {f === 'All' ? '全部' : riskLabelZh(f)}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-2 max-h-72 overflow-y-auto">
                {SAMPLE_POSTS
                  .filter(s => sampleFilter === 'All' || s.expectedRisk === sampleFilter)
                  .map(s => (
                    <div key={s.id} className="rounded p-3" style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white font-mono">{s.symbol}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2d3148', color: '#94a3b8' }}>
                            {s.source}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                            style={{
                              background: (RISK_COLOR[s.expectedRisk] ?? '#64748b') + '22',
                              color:      RISK_COLOR[s.expectedRisk] ?? '#64748b',
                              border:     `1px solid ${(RISK_COLOR[s.expectedRisk] ?? '#64748b')}55`,
                            }}>
                            {riskLabelZh(s.expectedRisk)}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setCurrentSample(s)
                            setSymbol(s.symbol)
                            setInputText(s.text)
                            setResult(null)
                            setActiveMode('text')
                            analyzeMutation.mutate({ text: s.text, symbol: s.symbol })
                          }}
                          className="text-xs px-2 py-0.5 rounded font-semibold"
                          style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
                        >
                          載入並分析
                        </button>
                      </div>
                      <p className="text-xs font-semibold text-white mb-0.5">{s.title}</p>
                      <p className="text-[10px]" style={{ color: '#475569' }}>{s.notes}</p>
                    </div>
                  ))
                }
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

              {/* ── Social summary: only show full card when data is available ── */}
            {!newsLoading && (() => {
              const ss = newsData?.social_summary
              const isAvailable = ss?.available === true && ss.total_mentions > 0 && ss.data_quality !== 'finnhub_social_not_authorized'
              if (!isAvailable) return null
              const buzzColor = ss!.risk_hint === 'High' ? '#ef4444' : ss!.risk_hint === 'Medium' ? '#f59e0b' : '#10b981'
              return (
                <div className="rounded-md p-3 mb-3 text-xs" style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold" style={{ color: '#94a3b8' }}>聚合社群聲量</span>
                    <span
                      className="px-2 py-0.5 rounded font-semibold"
                      style={{ background: buzzColor + '22', color: buzzColor, border: `1px solid ${buzzColor}55` }}
                    >
                      {ss!.risk_hint === 'High' ? '高聲量' : ss!.risk_hint === 'Medium' ? '中聲量' : '低聲量'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    {([
                      ['Reddit 提及', ss!.reddit_mentions],
                      ['Twitter 提及', ss!.twitter_mentions],
                      ['總提及數', ss!.total_mentions],
                      ['Reddit 情緒', ss!.reddit_sentiment.toFixed(3)],
                      ['Twitter 情緒', ss!.twitter_sentiment.toFixed(3)],
                      ['社群聲量分數', ss!.social_buzz_score.toFixed(1)],
                    ] as [string, string | number][]).map(([label, val]) => (
                      <div key={label} className="flex flex-col gap-0.5">
                        <span style={{ color: '#475569' }}>{label}</span>
                        <span className="font-mono font-semibold" style={{ color: '#f1f5f9' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1" style={{ color: '#334155' }}>
                    此為 Finnhub 聚合社群情緒，非即時 Reddit 原文爬取。僅作社群聲量與情緒警戒，不代表投資建議。
                  </p>
                </div>
              )
            })()}

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
                          <div className="flex items-center gap-1">
                            {item.model_source === 'colab_text_model' && (
                              <span className="text-[9px] px-1 py-0.5 rounded font-bold" style={{ background: '#1e3a2f', color: '#4ade80', border: '1px solid #166534' }}>
                                AI
                              </span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: '#2d3148', color: '#94a3b8' }}>
                              {item.source}
                            </span>
                          </div>
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

              {/* footnote — only shown when news loaded and social summary is not available */}
              {!newsLoading && newsData && (newsData.social_summary?.available !== true) && (
                <p className="mt-2 text-[10px]" style={{ color: '#334155' }}>
                  目前顯示 Finnhub 新聞訊號；Reddit/Twitter 聚合情緒因 API 權限限制暫未顯示。
                </p>
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
                    單篇文本分析結果
                  </span>
                  <span className="text-[10px] mb-1" style={{ color: '#475569' }}>
                    此文本偵測到的社群風險語言強度
                  </span>
                  <span
                    className="text-lg font-bold px-4 py-1.5 rounded-full"
                    style={{ background: riskColor + '22', color: riskColor, border: `1px solid ${riskColor}` }}
                  >
                    {riskLabelZh(result.predicted_risk_label)}
                  </span>
                </div>
                <span className="flex flex-col items-end gap-0.5">
                  <span className="text-xs" style={{ color: '#64748b' }}>
                    {getFriendlyModelSource(result.model_source)}
                    {apiSource === 'heuristic' && ' (本地推論)'}
                  </span>
                  {result.model_id && (
                    <span className="text-[10px] font-mono" style={{ color: '#334155' }}>
                      {result.model_id}
                    </span>
                  )}
                </span>
              </div>
              {savedId && (
                <span className="flex items-center gap-1 text-xs" style={{ color: '#10b981' }}>
                  <CheckCircle size={12} /> 已儲存 #{savedId}
                </span>
              )}
            </div>

            {/* Source URL indicator (URL mode only) */}
            {urlAnalyzedText && urlResult && (
              <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#475569' }}>
                <Globe size={10} color="#38bdf8" />
                <span>分析來源：</span>
                <a
                  href={urlResult.source_url || urlResult.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate max-w-sm underline"
                  style={{ color: '#38bdf8' }}
                >
                  {urlResult.source_url || urlResult.url}
                </a>
              </div>
            )}

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
              {result.direction_probabilities ? (
                <>
                  <ScoreMeter label="方向性情緒估計：看多" value={result.direction_probabilities['bullish'] ?? 0} color="#10b981" />
                  <ScoreMeter label="方向性情緒估計：看空" value={result.direction_probabilities['bearish'] ?? 0} color="#ef4444" />
                  <ScoreMeter label="方向性情緒估計：中性" value={result.direction_probabilities['neutral'] ?? 0} color="#94a3b8" />
                </>
              ) : (
                <>
                  <ScoreMeter label="方向性情緒估計：看多" value={result.bullish_probability} color="#10b981" />
                  <ScoreMeter label="方向性情緒估計：看空" value={result.bearish_probability} color="#ef4444" />
                </>
              )}
            </div>
            <p className="text-[10px]" style={{ color: '#475569' }}>
              方向性情緒僅為文字語氣估計，不代表買賣建議。
            </p>

            {/* Short squeeze */}
            {result.short_squeeze_narrative_detected && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold"
                   style={{ background: '#450a0a', color: '#f87171', border: '1px solid #991b1b' }}>
                <Zap size={14} /> 偵測到軋空（Short Squeeze）敘事
              </div>
            )}

            {/* Indicators explanation collapsible */}
            <div className="rounded-md" style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}>
              <button
                onClick={() => setShowIndicators(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold"
                style={{ color: '#64748b' }}
              >
                <span>指標說明</span>
                {showIndicators ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {showIndicators && (
                <div className="px-3 pb-3 flex flex-col gap-1.5">
                  {([
                    ['FOMO 語言強度',  '是否出現「錯過就來不及」、「現在不買會後悔」等急迫誘導語氣。'],
                    ['炒作語言強度',   '是否出現 to the moon、diamond hands、暴漲、翻倍等高情緒煽動語。'],
                    ['操縱訊號強度',   '是否出現保證獲利、集體拉抬、鼓吹立即買入等可疑訊號。'],
                    ['緊迫感強度',     '是否使用短時間壓力迫使讀者行動。'],
                    ['軋空敘事',       '是否強調 short squeeze、空頭被迫回補、散戶集結等敘事。'],
                    ['方向性情緒',     '文字偏看多、看空或中性。有 Colab 模型時使用方向模型機率，否則使用關鍵字啟發式估計。不等於投資建議。'],
                  ] as [string, string][]).map(([k, v]) => (
                    <div key={k} className="flex gap-2 text-[10px]">
                      <span className="font-semibold flex-shrink-0 w-24" style={{ color: '#94a3b8' }}>{k}</span>
                      <span style={{ color: '#475569' }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sample comparison (if from samples tab) */}
            {currentSample && (
              <div className="rounded-md px-3 py-2 text-xs" style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}>
                <span style={{ color: '#64748b' }}>參考標籤：</span>
                <span className="font-semibold ml-1" style={{ color: RISK_COLOR[currentSample.expectedRisk] ?? '#64748b' }}>
                  {riskLabelZh(currentSample.expectedRisk)}
                </span>
                <span className="mx-2" style={{ color: '#2d3148' }}>|</span>
                <span style={{ color: '#64748b' }}>模型預測：</span>
                <span className="font-semibold ml-1" style={{ color: riskColor }}>
                  {riskLabelZh(result.predicted_risk_label)}
                </span>
                <span className="ml-2 text-[10px]" style={{ color: currentSample.expectedRisk === result.predicted_risk_label ? '#10b981' : '#f59e0b' }}>
                  {currentSample.expectedRisk === result.predicted_risk_label
                    ? '與參考標籤一致'
                    : '模型判斷不同，請檢視指標與文字內容'}
                </span>
              </div>
            )}

            {/* Consistency warnings (D) */}
            {currentSample && currentSample.expectedRisk !== result.predicted_risk_label && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-md text-xs"
                   style={{ background: '#451a03', color: '#fbbf24', border: '1px solid #78350f' }}>
                <span className="flex-shrink-0">⚠</span>
                <span>模型一致性提醒：此範例的參考標籤與模型預測不同。此案例應列入模型檢核，不宜直接作為模型成效展示依據。</span>
              </div>
            )}
            {result.predicted_risk_label === 'Low' && result.short_squeeze_narrative_detected && (
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-md text-xs"
                   style={{ background: '#451a03', color: '#fbbf24', border: '1px solid #78350f' }}>
                <span className="flex-shrink-0">⚠</span>
                <span>局部訊號提醒：此文本偵測到軋空敘事，但整體模型分級仍為低風險。建議人工檢視文本內容與各項指標。</span>
              </div>
            )}

            {/* Explanation */}
            <div className="flex flex-col gap-1">
              <p className="text-[11px]" style={{ color: '#475569' }}>
                本結果僅代表該文本中的社群交易風險訊號，不代表股票價值或價格走勢。
              </p>
              <div className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
                {getLocalizedModelExplanation(result)}
              </div>
            </div>

            {/* ── Risk Brief ── */}
            <div className="rounded-lg p-4" style={{ background: '#0d0f1a', border: '1px solid #2d3148' }}>

              {/* Header */}
              <div className="mb-3">
                <span className="block text-xs font-semibold text-white">單篇文本分析報告</span>
                <p className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>
                  可匯出此篇文本之分析結果；本結果不代表標的投資價值或價格走勢。
                </p>
              </div>

              {/* Actions — responsive 2-col / 4-col grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-1">
                <button
                  onClick={handleCopySummary}
                  className="flex items-center justify-center gap-1 h-10 w-full rounded text-xs font-semibold transition-colors"
                  style={{
                    background: copiedSummary ? '#052e16' : '#2d3148',
                    color:      copiedSummary ? '#10b981' : '#94a3b8',
                    border:     `1px solid ${copiedSummary ? '#065f46' : '#3d4163'}`,
                  }}
                >
                  {copiedSummary ? <><Check size={11} /> 已複製</> : <><Copy size={11} /> 複製摘要</>}
                </button>
                <button
                  onClick={() => result && downloadWordReport(result, symbol, getConsistencyWarnings(result, currentSample))}
                  className="flex items-center justify-center gap-1 h-10 w-full rounded text-xs font-semibold"
                  style={{ background: '#2d3148', color: '#94a3b8', border: '1px solid #3d4163' }}
                >
                  下載 Word
                </button>
                <button
                  onClick={() => result && printReport(result, symbol, getConsistencyWarnings(result, currentSample))}
                  className="flex items-center justify-center gap-1 h-10 w-full rounded text-xs font-semibold"
                  style={{ background: '#2d3148', color: '#94a3b8', border: '1px solid #3d4163' }}
                >
                  列印 / PDF
                </button>
                <button
                  onClick={handleDownloadHtml}
                  className="flex items-center justify-center gap-1 h-10 w-full rounded text-xs font-semibold"
                  style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
                >
                  <Globe size={11} /> 下載 HTML
                </button>
              </div>
              <p className="text-[9px] mb-4" style={{ color: '#475569' }}>
                Word 可編輯；PDF 適合存檔；HTML 可離線互動瀏覽。
              </p>

              {/* Data grid — 5 核心欄位（badge 已顯示風險等級，不重複） */}
              <div className="grid grid-cols-2 gap-x-6 text-xs mb-2">
                {([
                  ['標的',    symbol],
                  ['FOMO 強度', result.fomo_score.toFixed(0)],
                  ['炒作語言',  result.hype_language_score.toFixed(0)],
                  ['操縱訊號',  result.manipulation_signal_score.toFixed(0)],
                  ['軋空敘事',  result.short_squeeze_narrative_detected ? '⚠ 已偵測' : '未偵測'],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label} className="flex justify-between py-1" style={{ borderBottom: '1px solid #1a1d27' }}>
                    <span style={{ color: '#64748b' }}>{label}</span>
                    <span className="font-mono text-right ml-2" style={{ color: '#f1f5f9' }}>{val}</span>
                  </div>
                ))}
              </div>

              {result.highlighted_terms.length > 0 && (
                <p className="text-[10px] mt-2 mb-2">
                  <span style={{ color: '#64748b' }}>關鍵詞彙：</span>
                  <span style={{ color: '#a78bfa' }}>{result.highlighted_terms.join(', ')}</span>
                </p>
              )}

              <p className="text-xs mt-2 mb-3" style={{ color: '#64748b' }}>
                {MONITORING_ACTIONS[result.predicted_risk_label]}
              </p>

              {/* 技術資訊 collapsible（model_source、data_quality、英文原始輸出） */}
              <div className="rounded-md" style={{ background: '#0a0c14', border: '1px solid #1a1d27' }}>
                <button
                  onClick={() => setShowTechInfo(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold"
                  style={{ color: '#475569' }}
                >
                  <span>技術資訊</span>
                  {showTechInfo ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>
                {showTechInfo && (
                  <div className="px-3 pb-3 flex flex-col gap-1 text-[10px]">
                    <div className="flex justify-between py-0.5">
                      <span style={{ color: '#64748b' }}>模型來源</span>
                      <span style={{ color: '#94a3b8' }}>{getFriendlyModelSource(result.model_source)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span style={{ color: '#64748b' }}>模型代碼</span>
                      <span className="font-mono" style={{ color: '#475569' }}>{result.model_source}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span style={{ color: '#64748b' }}>資料品質</span>
                      <span style={{ color: '#94a3b8' }}>{getFriendlyDataQuality(result.data_quality)}</span>
                    </div>
                    <div className="flex justify-between py-0.5">
                      <span style={{ color: '#64748b' }}>品質代碼</span>
                      <span className="font-mono" style={{ color: '#475569' }}>{result.data_quality}</span>
                    </div>
                    <div className="mt-1.5 pt-1.5" style={{ borderTop: '1px solid #1a1d27' }}>
                      <p className="mb-1" style={{ color: '#475569' }}>模型原始輸出（英文）：</p>
                      <p style={{ color: '#334155', lineHeight: '1.5' }}>{result.explanation}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── CTA：查看多來源綜合警戒報告 ── */}
            <div
              className="rounded-lg px-4 py-3 flex flex-col gap-2"
              style={{ background: '#0d1a2e', border: '1px solid #1e3a5f' }}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-white">單篇分析的範圍有限</span>
                  <span className="text-[10px]" style={{ color: '#64748b' }}>
                    單篇文本僅能反映該文章的社群風險訊號；此頁可進一步查看近期市場走勢與外部新聞訊號。多來源綜合警戒摘要將於後續階段加入。
                  </span>
                </div>
                <Link
                  to={`/risk-report/${symbol}`}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold flex-shrink-0 whitespace-nowrap transition-opacity hover:opacity-80"
                  style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
                >
                  查看此標的的市場與外部訊號 →
                </Link>
              </div>
            </div>

            {/* ── Event Abnormal Return Observation ── */}
            {symbol && (
              <div className="rounded-lg p-4" style={{ background: '#0d1220', border: '1px solid #1a2744' }}>
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp size={13} color="#38bdf8" />
                  <span className="text-xs font-semibold text-white">貼文事件後異常報酬觀察</span>
                </div>

                {/* Prompt when no date filled */}
                {!eventDate ? (
                  <p className="text-[10px] mb-3" style={{ color: '#475569' }}>
                    若要觀察貼文發布後的市場反應，請輸入貼文發布日期。系統會以該日期作為事件日，計算事件後異常報酬。此為市場行為觀察，不代表貼文造成股價變動。
                  </p>
                ) : (
                  <p className="text-[10px] mb-3" style={{ color: '#475569' }}>
                    以貼文日期為事件點，觀察事件後該股票相對 SPY 的異常報酬（Market Model）。此為市場行為觀察，不代表貼文造成股價變動。
                  </p>
                )}

                {/* Date input + trigger */}
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <label className="text-[10px] flex-shrink-0" style={{ color: '#64748b' }}>
                    貼文發布日期（選填）
                  </label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={e => { setEventDate(e.target.value); setEventArResult(null) }}
                    className="text-xs px-2 py-1 rounded outline-none"
                    style={{ background: '#0d0f1a', border: '1px solid #2d3148', color: '#f1f5f9' }}
                  />
                  <button
                    onClick={() => { if (eventDate) eventArMutation.mutate() }}
                    disabled={!eventDate || eventArMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-opacity disabled:opacity-40"
                    style={{ background: '#1e3a5f', color: '#38bdf8', border: '1px solid #2d4a6f' }}
                  >
                    {eventArMutation.isPending
                      ? <><RefreshCw size={11} className="animate-spin" /> 計算中…</>
                      : <><TrendingUp size={11} /> 計算異常報酬</>
                    }
                  </button>
                </div>
                {!eventDate && (
                  <p className="text-[9px] mb-2" style={{ color: '#334155' }}>
                    請先選擇貼文發布日期，才能計算事件後異常報酬。
                  </p>
                )}

                {/* Results */}
                {eventArResult && (
                  !eventArResult.success ? (
                    <div className="text-[11px] mt-2 py-2 px-3 rounded" style={{ background: '#1a0f0a', color: '#f87171', border: '1px solid #7f1d1d' }}>
                      {(eventArResult.available_days ?? 0) === 0
                        ? '事件後交易資料不足，暫無法計算完整 CAR。可改以 RiskReport 的近期 Market Model 異常報酬作為補充觀察。'
                        : `計算失敗：${eventArResult.error}`
                      }
                    </div>
                  ) : (
                    <>
                      {(eventArResult.available_days ?? 5) < (eventArResult.event_window_days ?? 5) && (
                        <div className="text-[10px] mt-2 mb-2 px-3 py-2 rounded" style={{ background: '#1c1200', color: '#fbbf24', border: '1px solid #78350f' }}>
                          事件後交易資料不足，暫無法計算完整 CAR。可改以 RiskReport 的近期 Market Model 異常報酬作為補充觀察。
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-x-6 text-xs mt-2 mb-2">
                        {([
                          ['Event Date',   eventArResult.event_date],
                          ['Benchmark',    eventArResult.benchmark ?? 'SPY'],
                          ['Event-day AR', eventArResult.event_abnormal_return != null ? `${(eventArResult.event_abnormal_return * 100).toFixed(2)}%` : '—'],
                          ['CAR 3d',       eventArResult.car_3d != null ? `${(eventArResult.car_3d * 100).toFixed(2)}%` : '—'],
                          ['CAR 5d',       eventArResult.car_5d != null ? `${(eventArResult.car_5d * 100).toFixed(2)}%` : '—'],
                          ['Alpha (α)',    eventArResult.alpha != null ? eventArResult.alpha.toFixed(5) : '—'],
                          ['Beta (β)',     eventArResult.beta  != null ? eventArResult.beta.toFixed(3)  : '—'],
                          ['Risk Level',  eventArResult.risk_level ?? '—'],
                        ] as [string, string][]).map(([label, val]) => (
                          <div key={label} className="flex justify-between py-1" style={{ borderBottom: '1px solid #1a1d27' }}>
                            <span style={{ color: '#64748b' }}>{label}</span>
                            <span className="font-mono text-right ml-2" style={{ color: '#f1f5f9' }}>{val}</span>
                          </div>
                        ))}
                      </div>
                      {eventArResult.interpretation && (
                        <p className="text-[11px] mt-2" style={{ color: '#94a3b8' }}>
                          {eventArResult.interpretation}
                        </p>
                      )}
                      <p className="text-[9px] mt-2" style={{ color: '#334155' }}>
                        ⓘ 此指標僅觀察事件後市場異常，不代表貼文造成股價變動
                      </p>
                    </>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
