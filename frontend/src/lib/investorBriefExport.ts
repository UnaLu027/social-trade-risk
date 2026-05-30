// Caution brief report export — Word / Print-PDF / HTML / clipboard
// Positions: external news text signals + market data only
// NOT investment advice; NOT social forum signals

import type { InvestorCautionResult, NewsRelevanceLevel } from './investorCaution'

// ── Input types ───────────────────────────────────────────────────────────────

export interface BriefNewsItem {
  headline: string | null
  url: string | null
  ai_risk_label: string | null
  ai_risk_score: number | null
  published_at: string
  source: string
  relevance?: NewsRelevanceLevel
}

export interface BriefHistItem {
  date: string
  market_heat_score: number
  volatility_anomaly_score: number
  fomo_score: number
  short_squeeze_pressure: number
  market_risk_label: string
}

export interface BriefExportInput {
  symbol: string
  caution: InvestorCautionResult
  signalItems: BriefNewsItem[]
  histItems: BriefHistItem[]
  latestSnapshot: {
    snapshot_date: string
    price: number | null
    ai_risk_label: string | null
  } | null
  snapshotIsPhpFallback: boolean
  newsCoverageText: string
  snapshotStatusText: string
  historyStatusText: string
}

// ── Label constants ───────────────────────────────────────────────────────────

const SIG_LABEL: Record<string, string> = {
  low: '低警戒', medium: '中警戒', high: '高警戒',
  extreme: '極高警戒', insufficient_data: '資料不足',
}
const SIG_COLOR: Record<string, string> = {
  low: '#10b981', medium: '#f59e0b', high: '#f97316',
  extreme: '#ef4444', insufficient_data: '#64748b',
}
const COV_LABEL: Record<string, string> = {
  FULL: '完整（3 / 3）', PARTIAL: '部分可用',
  MINIMAL: '僅一類可用', NONE: '無資料',
}
const INTERP_LABEL: Record<string, string> = {
  comprehensive: '綜合觀察', preliminary: '初步觀察',
  insufficient_data: '資料不足',
}
const RISK_ZH: Record<string, string> = {
  Low: '低警戒', Medium: '中警戒', High: '高警戒', Critical: '極高警戒',
}

// ── Label constants ── (continued) ────────────────────────────────────────────

const REL_LABEL: Record<string, string> = {
  direct: '直接相關', contextual: '間接相關', low: '低相關 · 未納入主要計分',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const p = new URL(url)
    return p.protocol === 'http:' || p.protocol === 'https:' ? url : null
  } catch { return null }
}

function fmtUtc(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

function scoreColor(n: number): string {
  return n >= 75 ? '#ef4444' : n >= 55 ? '#f97316' : n >= 35 ? '#f59e0b' : '#10b981'
}

// ── Text summary (clipboard) ──────────────────────────────────────────────────

function buildSummaryText(inp: BriefExportInput): string {
  const { symbol, caution, signalItems, histItems } = inp
  const sep = '══════════════════════════════════════════════════════'
  const lines: string[] = [
    sep,
    '外部新聞與市場訊號綜合警戒摘要報告',
    `股票代號：${symbol}　　生成時間：${fmtUtc(caution.generatedAt)}`,
    sep,
    '⚠ 非投資建議 — 本報告僅供觀察警戒訊號，不構成投資建議或買賣建議',
    '',
    '【已接入資料來源涵蓋狀態】',
    `• 外部新聞文本訊號：${inp.newsCoverageText}`,
    `• 最新市場快照：${inp.snapshotStatusText}`,
    `• 近期市場趨勢：${inp.historyStatusText}`,
    '• 社群論壇資料：尚未接入',
    '',
    '【綜合警戒摘要】',
    `訊號等級：${SIG_LABEL[caution.signalLevel] ?? caution.signalLevel}`,
    `已接入來源涵蓋：${COV_LABEL[caution.dataCoverage] ?? caution.dataCoverage}`,
    `分析狀態：${INTERP_LABEL[caution.interpretationStatus] ?? caution.interpretationStatus}`,
    `綜合評分：${caution.score} / 100`,
    '',
    '計分明細：',
    `  外部新聞文本訊號 (Finnhub)：${caution.scoreBreakdown.externalNews}`,
    `  最新市場快照：${caution.scoreBreakdown.latestMarketSnapshot}`,
    `  近期市場趨勢：${caution.scoreBreakdown.marketHistory}`,
  ]

  if (caution.coverageNote) {
    lines.push('', `※ ${caution.coverageNote}`)
  }

  lines.push('', '【主要警戒因子】')
  if (caution.keyFactors.length === 0) {
    lines.push('目前未偵測到高警戒主要因子')
  } else {
    caution.keyFactors.forEach((f, i) => {
      lines.push(`${i + 1}. ${f.description}`)
      lines.push(`   來源：${f.source}${f.sourceDate ? ' · ' + fmtUtc(f.sourceDate) : ''}`)
    })
  }

  lines.push('', '【最新外部新聞文本訊號（Finnhub）】')
  lines.push(`納入計分：${inp.newsCoverageText}`)
  lines.push('目前資料來源為 Finnhub 新聞文本；系統分析文本中的社群交易風險語言，尚未代表論壇社群討論熱度。')
  if (signalItems.length === 0) {
    lines.push('（無可顯示之新聞項目）')
  } else {
    signalItems.slice(0, 5).forEach((item, i) => {
      const label  = item.ai_risk_label ? `[${RISK_ZH[item.ai_risk_label] ?? item.ai_risk_label} / ${item.ai_risk_score ?? 0}]` : ''
      const relStr = item.relevance ? `[${REL_LABEL[item.relevance] ?? item.relevance}]` : ''
      lines.push(`${i + 1}. ${label} ${relStr} ${item.headline ?? '（無標題）'}`.trim())
      lines.push(`   ${item.source} · ${fmtUtc(item.published_at)}`)
      const u = safeUrl(item.url)
      if (u) lines.push(`   ${u}`)
    })
  }

  if (histItems.length > 0) {
    const recent = histItems.slice(-1)[0]
    lines.push('', '【近期市場趨勢（最新一日）】')
    lines.push(`日期：${recent.date}　市場警戒訊號：${RISK_ZH[recent.market_risk_label] ?? recent.market_risk_label}`)
    lines.push(`市場熱度：${recent.market_heat_score}　波動異常：${recent.volatility_anomaly_score}`)
    lines.push(`FOMO：${recent.fomo_score}　軋空壓力：${recent.short_squeeze_pressure}`)
  }

  lines.push(
    '',
    '【交叉查證建議】',
    '• 查閱公司官方公告與 IR 資訊',
    '• 核對財報、重大訊息與交易所公告',
    '• 比較多個獨立新聞來源',
    '• 觀察市場波動與外部新聞訊號是否同步升高',
    '• 社群論壇資料尚未接入，勿將本摘要視為完整社群熱度分析',
    '',
    '【方法與限制】',
    '本階段整合 Finnhub 外部新聞文本訊號、最新市場快照與近期市場趨勢。',
    '外部新聞先依標的關聯性進行規則式篩選；低相關新聞不納入主要警戒計分。',
    '外部新聞文本模型係偵測社群交易風險語言，並非判斷新聞真偽，也不是預測股價。',
    '完整（3 / 3）只代表目前已接入三類來源可取得，不代表已涵蓋所有可能資訊來源。',
    '社群論壇資料尚未接入。',
    '',
    '【非投資建議聲明】',
    '本報告用於觀察目前可取得資料中的警戒訊號強度，不構成投資建議、買賣建議、持倉建議或財務顧問服務，也不代表未來價格走勢。投資判斷仍應結合公司公告、財報、估值、風險承受能力與專業意見。',
    '',
    sep,
    '由社群交易風險分析系統自動產生',
    sep,
  )
  return lines.join('\n')
}

// ── Word HTML builder ─────────────────────────────────────────────────────────

function buildWordHtml(inp: BriefExportInput): string {
  const { symbol, caution, signalItems, histItems } = inp
  const sigColor = SIG_COLOR[caution.signalLevel] ?? '#64748b'

  function scoreRow(label: string, val: number): string {
    return `<tr><td>${escapeHtml(label)}</td><td>${val} / 100</td></tr>`
  }

  function newsCards(): string {
    if (signalItems.length === 0) return '<p>目前無可分析之外部新聞文本訊號</p>'
    return signalItems.slice(0, 5).map((item, i) => {
      const u      = safeUrl(item.url)
      const label  = item.ai_risk_label ? (RISK_ZH[item.ai_risk_label] ?? item.ai_risk_label) : '—'
      const score  = item.ai_risk_score ?? 0
      const relStr = item.relevance ? `【${REL_LABEL[item.relevance] ?? item.relevance}】` : ''
      return `<table class="word-news-card-table">
        <tr>
          <td>
            <p class="news-title">${i + 1}. ${escapeHtml(item.headline ?? '（無標題）')}</p>
            <p>相關性：${escapeHtml(relStr || '—')}　｜　文本風險語言強度：${escapeHtml(label)}　｜　分數：${score}</p>
            <p>發布時間：${escapeHtml(fmtUtc(item.published_at))}　｜　來源：Finnhub</p>
            ${u ? `<p><a href="${escapeHtml(u)}">查看原文</a></p>` : ''}
          </td>
        </tr>
      </table>`
    }).join('\n')
  }

  function factorRows(): string {
    if (caution.keyFactors.length === 0) {
      return '<p>目前未偵測到高警戒主要因子</p>'
    }
    return caution.keyFactors.map((f, i) => `
      <p><strong>${i + 1}. ${escapeHtml(f.description)}</strong><br>
      來源：${escapeHtml(f.source)}${f.sourceDate ? '　' + escapeHtml(fmtUtc(f.sourceDate)) : ''}</p>
    `).join('\n')
  }

  function histTable(): string {
    if (histItems.length === 0) return '<p>（近期市場趨勢資料不足）</p>'
    const recent = histItems.slice(-5).reverse()
    const rows = recent.map(h => `<tr>
      <td>${escapeHtml(h.date)}</td>
      <td>${escapeHtml(RISK_ZH[h.market_risk_label] ?? h.market_risk_label)}</td>
      <td>${h.market_heat_score}</td>
      <td>${h.volatility_anomaly_score}</td>
      <td>${h.fomo_score}</td>
      <td>${h.short_squeeze_pressure}</td>
    </tr>`).join('\n')
    return `<table border="1" cellpadding="4" cellspacing="0">
      <tr><th>日期</th><th>市場警戒訊號</th><th>市場熱度</th><th>波動異常</th><th>FOMO</th><th>軋空壓力</th></tr>
      ${rows}
    </table>`
  }

  return `<html xmlns:o='urn:schemas-microsoft-com:office:office'
  xmlns:w='urn:schemas-microsoft-com:office:word'
  xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'>
<style>
body { font-family: 'Microsoft JhengHei', Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }
h1 { font-size: 16pt; font-weight: bold; margin-bottom: 6pt; }
h2 { font-size: 13pt; font-weight: bold; margin-top: 18pt; margin-bottom: 6pt;
     border-bottom: 1pt solid #ccc; padding-bottom: 3pt; }
.meta { color: #555; font-size: 9pt; margin-bottom: 12pt; }
.signal-badge { font-size: 14pt; font-weight: bold; color: ${sigColor}; }
.disclaimer-table { width: 100%; border-collapse: collapse; margin: 12pt 0; }
.disclaimer-table td { background: #fff8e1; border: 1pt solid #f0c040; padding: 8pt; }
.warning-box { background: #fef2f2; border: 1pt solid #fca5a5; padding: 6pt; margin: 8pt 0; }
.word-news-card-table { width: 100%; border-collapse: collapse; margin: 8pt 0;
  page-break-inside: avoid; break-inside: avoid; }
.word-news-card-table td { border: 1pt solid #d9e2f3; padding: 8pt;
  page-break-inside: avoid; break-inside: avoid; }
.word-news-card-table tr { page-break-inside: avoid; break-inside: avoid; }
.news-title { font-weight: bold; margin: 0 0 4pt 0; }
.word-news-card-table p { margin: 2pt 0; }
a { color: #2563eb; text-decoration: underline; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
td, th { border: 1pt solid #ccc; padding: 4pt 6pt; }
th { background: #f0f0f0; font-weight: bold; }
p { margin: 4pt 0; }
ul { margin: 4pt 0; padding-left: 16pt; }
li { margin: 3pt 0; }
</style>
</head>
<body>
<h1>外部新聞與市場訊號綜合警戒摘要報告</h1>
<div class="meta">
  股票代號：${escapeHtml(symbol)}
  生成時間：${escapeHtml(fmtUtc(caution.generatedAt))}
</div>

<table class="disclaimer-table">
  <tr>
    <td>⚠ <strong>非投資建議聲明：</strong>本報告用於觀察警戒訊號強度，不構成投資建議、買賣建議、持倉建議或財務顧問服務，也不代表未來價格走勢。</td>
  </tr>
</table>

<h2>一、已接入資料來源涵蓋狀態</h2>
<table>
  <tr><th>資料來源</th><th>狀態</th></tr>
  <tr><td>外部新聞文本訊號（Finnhub）</td><td>${escapeHtml(inp.newsCoverageText)}</td></tr>
  <tr><td>最新市場快照</td><td>${escapeHtml(inp.snapshotStatusText)}</td></tr>
  <tr><td>近期市場趨勢</td><td>${escapeHtml(inp.historyStatusText)}</td></tr>
  <tr><td>社群論壇資料</td><td>尚未接入</td></tr>
</table>
<p><small>目前資料來源為 Finnhub 新聞文本；系統分析文本中的社群交易風險語言，尚未代表論壇社群討論熱度。</small></p>

<h2>二、綜合警戒摘要</h2>
<table>
  <tr><th>項目</th><th>結果</th></tr>
  <tr><td>訊號等級</td><td class="signal-badge">${escapeHtml(SIG_LABEL[caution.signalLevel] ?? caution.signalLevel)}</td></tr>
  <tr><td>已接入來源涵蓋</td><td>${escapeHtml(COV_LABEL[caution.dataCoverage] ?? caution.dataCoverage)}</td></tr>
  <tr><td>分析狀態</td><td>${escapeHtml(INTERP_LABEL[caution.interpretationStatus] ?? caution.interpretationStatus)}</td></tr>
  <tr><td>綜合評分</td><td>${caution.score} / 100</td></tr>
</table>
<table>
  <tr><th>計分項目</th><th>分數</th></tr>
  ${scoreRow('外部新聞文本訊號 (Finnhub)', caution.scoreBreakdown.externalNews)}
  ${scoreRow('最新市場快照', caution.scoreBreakdown.latestMarketSnapshot)}
  ${scoreRow('近期市場趨勢', caution.scoreBreakdown.marketHistory)}
</table>
${caution.coverageNote ? `<div class="warning-box">${escapeHtml(caution.coverageNote)}</div>` : ''}

<h2>三、主要警戒因子</h2>
${factorRows()}

<h2 style="page-break-before: always;">四、最新外部新聞文本訊號（Finnhub）</h2>
${newsCards()}

<h2 style="page-break-before: always;">五、近期市場趨勢</h2>
${histTable()}

<h2>六、交叉查證建議</h2>
<ul>
  <li>查閱公司官方公告與 IR 資訊</li>
  <li>核對財報、重大訊息與交易所公告</li>
  <li>比較多個獨立新聞來源</li>
  <li>觀察市場波動與外部新聞訊號是否同步升高</li>
  <li>社群論壇資料尚未接入，勿將本摘要視為完整社群熱度分析</li>
</ul>

<h2>七、方法與限制</h2>
<p>本階段整合 Finnhub 外部新聞文本訊號、最新市場快照與近期市場趨勢。</p>
<p>外部新聞先依標的關聯性進行規則式篩選；低相關新聞不納入主要警戒計分。</p>
<p>外部新聞文本模型係偵測社群交易風險語言，並非判斷新聞真偽，也不是預測股價。</p>
<p>完整（3 / 3）只代表目前已接入三類來源可取得，不代表已涵蓋所有可能資訊來源。</p>
<p>社群論壇資料尚未接入。</p>

<h2>八、非投資建議聲明</h2>
<p>本報告用於觀察目前可取得資料中的警戒訊號強度，不構成投資建議、買賣建議、持倉建議或財務顧問服務，也不代表未來價格走勢。投資判斷仍應結合公司公告、財報、估值、風險承受能力與專業意見。</p>
</body>
</html>`
}


// ── Print HTML builder ────────────────────────────────────────────────────────

function buildPrintHtml(inp: BriefExportInput): string {
  const { symbol, caution, signalItems, histItems } = inp
  const sigColor = SIG_COLOR[caution.signalLevel] ?? '#64748b'

  function bar(val: number): string {
    const col = val >= 75 ? '#dc2626' : val >= 55 ? '#ea580c' : val >= 35 ? '#d97706' : '#16a34a'
    return `<div style="background:#e5e7eb;height:8px;border-radius:4px;margin:3px 0;">
      <div style="background:${col};width:${Math.min(val, 100)}%;height:8px;border-radius:4px;"></div>
    </div>`
  }

  function newsSection(): string {
    if (signalItems.length === 0) return '<p style="color:#666;">（無可顯示之新聞項目）</p>'
    return signalItems.slice(0, 5).map(item => {
      const u      = safeUrl(item.url)
      const label  = item.ai_risk_label ? `[${RISK_ZH[item.ai_risk_label] ?? item.ai_risk_label}]` : ''
      const relStr = item.relevance ? `[${REL_LABEL[item.relevance] ?? item.relevance}]` : ''
      const isLow  = item.relevance === 'low'
      return `<div class="news-card" style="border:1px solid #e5e7eb;padding:8px 12px;margin:6px 0;border-radius:4px;${isLow ? 'opacity:0.7;' : ''}">
        <div style="font-weight:600;">${escapeHtml(item.headline ?? '（無標題）')}</div>
        <div style="color:#555;font-size:10pt;">${escapeHtml(relStr)} ${escapeHtml(label)} ${escapeHtml(item.source)} · ${escapeHtml(fmtUtc(item.published_at))}${item.ai_risk_score != null ? ` · ${item.ai_risk_score}分` : ''}</div>
        ${u ? `<div style="font-size:9pt;color:#2563eb;word-break:break-all;">${escapeHtml(u)}</div>` : ''}
      </div>`
    }).join('\n')
  }

  function histSection(): string {
    if (histItems.length === 0) return '<p style="color:#666;">（近期市場趨勢資料不足）</p>'
    const recent = histItems.slice(-5).reverse()
    const rows = recent.map(h => `<tr>
      <td>${escapeHtml(h.date)}</td>
      <td>${escapeHtml(RISK_ZH[h.market_risk_label] ?? h.market_risk_label)}</td>
      <td>${h.market_heat_score}</td>
      <td>${h.volatility_anomaly_score}</td>
      <td>${h.fomo_score}</td>
      <td>${h.short_squeeze_pressure}</td>
    </tr>`).join('\n')
    return `<table style="border-collapse:collapse;width:100%;font-size:10pt;">
      <tr style="background:#f5f5f5;">
        <th style="border:1px solid #ddd;padding:4px 8px;">日期</th>
        <th style="border:1px solid #ddd;padding:4px 8px;">市場警戒訊號</th>
        <th style="border:1px solid #ddd;padding:4px 8px;">市場熱度</th>
        <th style="border:1px solid #ddd;padding:4px 8px;">波動異常</th>
        <th style="border:1px solid #ddd;padding:4px 8px;">FOMO</th>
        <th style="border:1px solid #ddd;padding:4px 8px;">軋空壓力</th>
      </tr>
      ${rows}
    </table>`
  }

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<title>警戒摘要報告 ${escapeHtml(symbol)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Microsoft JhengHei', 'PingFang TC', Arial, sans-serif;
    font-size: 11pt; color: #1a1a1a; background: white;
    max-width: 800px; margin: 0 auto; padding: 20px;
  }
  h1 { font-size: 16pt; margin: 0 0 4px; }
  h2 { font-size: 12pt; margin: 20px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  .meta { color: #555; font-size: 9.5pt; margin-bottom: 14px; }
  .disclaimer-box {
    background: #fefce8; border: 1px solid #fde047;
    padding: 8px 12px; margin: 12px 0; border-radius: 4px; font-size: 9.5pt;
  }
  .signal-label { font-size: 20pt; font-weight: 900; color: ${sigColor}; }
  .score-label { font-size: 9pt; color: #555; margin: 4px 0 1px; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 8px 0; }
  .stat-card { border: 1px solid #e5e7eb; padding: 8px 12px; border-radius: 4px; }
  .stat-title { font-size: 9pt; color: #888; margin-bottom: 4px; }
  .stat-value { font-size: 11pt; font-weight: 600; }
  .print-btn {
    display: block; margin: 16px auto; padding: 8px 24px;
    background: #1d4ed8; color: white; border: none;
    border-radius: 4px; cursor: pointer; font-size: 11pt;
  }
  .news-card {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  table {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  @media print {
    .no-print { display: none !important; }
    @page { margin: 1.8cm; }
    body { max-width: 100%; padding: 0; }
    .news-card { break-inside: avoid; page-break-inside: avoid; }
    table { break-inside: avoid; page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="no-print" style="text-align:center;padding:12px 0;border-bottom:1px solid #e5e7eb;margin-bottom:16px;">
  <button class="print-btn" onclick="window.print()">列印 / 另存 PDF</button>
</div>

<h1>外部新聞與市場訊號綜合警戒摘要報告</h1>
<div class="meta">股票代號：${escapeHtml(symbol)}　　生成時間：${escapeHtml(fmtUtc(caution.generatedAt))}</div>

<div class="disclaimer-box">
  ⚠ <strong>非投資建議：</strong>本報告用於觀察警戒訊號強度，不構成投資建議、買賣建議或財務顧問服務，也不代表未來價格走勢。
</div>

<h2>一、已接入資料來源涵蓋狀態</h2>
<table style="border-collapse:collapse;width:100%;font-size:10pt;">
  <tr style="background:#f5f5f5;">
    <th style="border:1px solid #ddd;padding:5px 8px;text-align:left;">資料來源</th>
    <th style="border:1px solid #ddd;padding:5px 8px;text-align:left;">狀態</th>
  </tr>
  <tr><td style="border:1px solid #ddd;padding:5px 8px;">外部新聞文本訊號（Finnhub）</td><td style="border:1px solid #ddd;padding:5px 8px;">${escapeHtml(inp.newsCoverageText)}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:5px 8px;">最新市場快照</td><td style="border:1px solid #ddd;padding:5px 8px;">${escapeHtml(inp.snapshotStatusText)}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:5px 8px;">近期市場趨勢</td><td style="border:1px solid #ddd;padding:5px 8px;">${escapeHtml(inp.historyStatusText)}</td></tr>
  <tr><td style="border:1px solid #ddd;padding:5px 8px;">社群論壇資料</td><td style="border:1px solid #ddd;padding:5px 8px;">尚未接入</td></tr>
</table>
<p style="font-size:9pt;color:#666;">目前資料來源為 Finnhub 新聞文本；系統分析文本中的社群交易風險語言，尚未代表論壇社群討論熱度。</p>

<h2>二、綜合警戒摘要</h2>
<div style="text-align:center;padding:12px 0;">
  <div class="signal-label">${escapeHtml(SIG_LABEL[caution.signalLevel] ?? caution.signalLevel)}</div>
  <div style="color:#555;font-size:10pt;margin-top:4px;">${caution.score} / 100 · ${escapeHtml(COV_LABEL[caution.dataCoverage] ?? '')} · ${escapeHtml(INTERP_LABEL[caution.interpretationStatus] ?? '')}</div>
</div>
<div class="score-label">外部新聞文本訊號 (Finnhub)：${caution.scoreBreakdown.externalNews}</div>
${bar(caution.scoreBreakdown.externalNews)}
<div class="score-label">最新市場快照：${caution.scoreBreakdown.latestMarketSnapshot}</div>
${bar(caution.scoreBreakdown.latestMarketSnapshot)}
<div class="score-label">近期市場趨勢：${caution.scoreBreakdown.marketHistory}</div>
${bar(caution.scoreBreakdown.marketHistory)}
${caution.coverageNote ? `<p style="margin-top:10px;font-size:10pt;color:#555;">※ ${escapeHtml(caution.coverageNote)}</p>` : ''}

<h2>三、主要警戒因子</h2>
${caution.keyFactors.length === 0
    ? '<p>目前未偵測到高警戒主要因子</p>'
    : caution.keyFactors.map((f, i) => `<p><strong>${i + 1}. ${escapeHtml(f.description)}</strong><br><span style="font-size:9.5pt;color:#555;">來源：${escapeHtml(f.source)}${f.sourceDate ? '　' + escapeHtml(fmtUtc(f.sourceDate)) : ''}</span></p>`).join('\n')}

<h2>四、最新外部新聞文本訊號（Finnhub）</h2>
${newsSection()}

<h2>五、近期市場趨勢</h2>
${histSection()}

<h2>六、交叉查證建議</h2>
<ul style="font-size:10.5pt;line-height:1.7;">
  <li>查閱公司官方公告與 IR 資訊</li>
  <li>核對財報、重大訊息與交易所公告</li>
  <li>比較多個獨立新聞來源</li>
  <li>觀察市場波動與外部新聞訊號是否同步升高</li>
  <li>社群論壇資料尚未接入，勿將本摘要視為完整社群熱度分析</li>
</ul>

<h2>七、方法與限制</h2>
<p>本階段整合 Finnhub 外部新聞文本訊號、最新市場快照與近期市場趨勢。</p>
<p>外部新聞先依標的關聯性進行規則式篩選；低相關新聞不納入主要警戒計分。</p>
<p>外部新聞文本模型係偵測社群交易風險語言，並非判斷新聞真偽，也不是預測股價。</p>
<p>完整（3 / 3）只代表目前已接入三類來源可取得，不代表已涵蓋所有可能資訊來源。</p>
<p>社群論壇資料尚未接入。</p>

<h2>八、非投資建議聲明</h2>
<p>本報告用於觀察目前可取得資料中的警戒訊號強度，不構成投資建議、買賣建議、持倉建議或財務顧問服務，也不代表未來價格走勢。投資判斷仍應結合公司公告、財報、估值、風險承受能力與專業意見。</p>

</body>
</html>`
}

// ── Full interactive HTML builder ─────────────────────────────────────────────

function buildFullHtml(inp: BriefExportInput): string {
  const { symbol, caution, signalItems, histItems } = inp
  const sigColor = SIG_COLOR[caution.signalLevel] ?? '#64748b'

  function scoreBar(val: number, label: string): string {
    const col = scoreColor(val)
    return `<div style="margin:8px 0;">
      <div style="display:flex;justify-content:space-between;margin-bottom:3px;">
        <span style="font-size:11px;color:#94a3b8;">${escapeHtml(label)}</span>
        <span style="font-size:11px;font-family:monospace;font-weight:600;color:${col};">${val}</span>
      </div>
      <div style="background:#2d3148;height:6px;border-radius:3px;">
        <div style="background:${col};width:${Math.min(val, 100)}%;height:6px;border-radius:3px;"></div>
      </div>
    </div>`
  }

  function miniBar(val: number, label: string): string {
    const col = scoreColor(val)
    return `<div style="margin:5px 0;">
      <div style="font-size:10px;color:#94a3b8;margin-bottom:2px;">${escapeHtml(label)} <span style="color:${col};font-weight:600;">${val}</span></div>
      <div style="background:#2d3148;height:4px;border-radius:2px;">
        <div style="background:${col};width:${Math.min(val, 100)}%;height:4px;border-radius:2px;"></div>
      </div>
    </div>`
  }

  const tabNames = [
    ['summary', '摘要'],
    ['coverage', '資料涵蓋'],
    ['factors', '警戒因子'],
    ['news', '外部新聞'],
    ['history', '市場趨勢'],
    ['methods', '方法與限制'],
  ]

  const tabBtns = tabNames.map(([id, label], i) =>
    `<button class="tab-btn${i === 0 ? ' active' : ''}" onclick="showTab('${id}',this)">${escapeHtml(label)}</button>`
  ).join('\n')

  // Tab 1: Summary
  const factorsHtml = caution.keyFactors.length === 0
    ? `<div style="color:#64748b;font-size:12px;padding:12px 0;">目前未偵測到高警戒主要因子</div>`
    : caution.keyFactors.map(f => `
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <div style="color:${sigColor};font-size:11px;flex-shrink:0;margin-top:2px;">▲</div>
        <div>
          <div style="font-size:13px;color:#e2e8f0;">${escapeHtml(f.description)}</div>
          <div style="font-size:11px;color:#64748b;margin-top:2px;">${escapeHtml(f.source)}${f.sourceDate ? ' · ' + escapeHtml(fmtUtc(f.sourceDate)) : ''}</div>
        </div>
      </div>`).join('')

  const tab1 = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px;">
      <div style="background:#0f1117;border:1px solid ${sigColor}44;border-radius:6px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:#64748b;margin-bottom:4px;">訊號等級</div>
        <div style="font-size:20px;font-weight:900;color:${sigColor};">${escapeHtml(SIG_LABEL[caution.signalLevel] ?? caution.signalLevel)}</div>
        <div style="font-size:10px;color:#64748b;margin-top:2px;font-family:monospace;">${caution.score} / 100</div>
      </div>
      <div style="background:#0f1117;border:1px solid #2d3148;border-radius:6px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:#64748b;margin-bottom:4px;">已接入來源涵蓋</div>
        <div style="font-size:14px;font-weight:700;color:#e2e8f0;">${escapeHtml(COV_LABEL[caution.dataCoverage] ?? caution.dataCoverage)}</div>
      </div>
      <div style="background:#0f1117;border:1px solid #2d3148;border-radius:6px;padding:12px;text-align:center;">
        <div style="font-size:10px;color:#64748b;margin-bottom:4px;">分析狀態</div>
        <div style="font-size:14px;font-weight:700;color:#e2e8f0;">${escapeHtml(INTERP_LABEL[caution.interpretationStatus] ?? caution.interpretationStatus)}</div>
      </div>
    </div>
    <div style="background:#0f1117;border:1px solid #2d3148;border-radius:6px;padding:14px;margin-bottom:16px;">
      <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:10px;">計分明細</div>
      ${scoreBar(caution.scoreBreakdown.externalNews, '外部新聞文本訊號 (Finnhub)')}
      ${scoreBar(caution.scoreBreakdown.latestMarketSnapshot, '最新市場快照')}
      ${scoreBar(caution.scoreBreakdown.marketHistory, '近期市場趨勢')}
    </div>
    ${caution.coverageNote ? `<div style="font-size:11px;color:#94a3b8;margin-bottom:16px;padding:10px;background:#1e2235;border-radius:4px;">${escapeHtml(caution.coverageNote)}</div>` : ''}
    <div style="background:#0f1117;border:1px solid #2d3148;border-radius:6px;padding:14px;">
      <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:10px;">主要警戒因子</div>
      ${factorsHtml}
    </div>`

  // Tab 2: Coverage
  function covCell(label: string, status: string, color: string): string {
    return `<div style="background:#0f1117;border:1px solid #2d3148;border-radius:6px;padding:12px;">
      <div style="font-size:10px;color:#64748b;margin-bottom:4px;">${escapeHtml(label)}</div>
      <div style="font-size:12px;font-weight:600;color:${color};">${escapeHtml(status)}</div>
    </div>`
  }

  const snapshotColor = inp.snapshotStatusText === '可用' ? '#10b981'
    : inp.snapshotStatusText === '歷史 fallback' ? '#f59e0b'
    : inp.snapshotStatusText === '取得失敗' ? '#ef4444' : '#64748b'
  const histColor = inp.historyStatusText.includes('交易日') ? '#10b981'
    : inp.historyStatusText === '取得失敗' ? '#ef4444' : '#64748b'
  const newsColor = inp.newsCoverageText.includes('可分析') ? '#10b981'
    : inp.newsCoverageText === '取得失敗' ? '#ef4444' : '#64748b'

  const tab2 = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
      ${covCell('外部新聞文本訊號', inp.newsCoverageText, newsColor)}
      ${covCell('最新市場快照', inp.snapshotStatusText, snapshotColor)}
      ${covCell('近期市場趨勢', inp.historyStatusText, histColor)}
      ${covCell('社群論壇資料', '尚未接入', '#475569')}
    </div>
    <div style="font-size:11px;color:#64748b;line-height:1.7;">
      <p>完整（3 / 3）係指目前已接入之 Finnhub 外部新聞、最新市場快照與近期市場趨勢資料；社群論壇資料尚未納入本階段摘要。</p>
      <p style="margin-top:8px;">目前資料來源為 Finnhub 新聞文本；系統分析文本中的社群交易風險語言，尚未代表論壇社群討論熱度。</p>
    </div>`

  // Tab 3: Factors
  const tab3 = caution.keyFactors.length === 0
    ? `<div style="color:#64748b;font-size:13px;padding:24px 0;text-align:center;">目前未偵測到高警戒主要因子</div>`
    : caution.keyFactors.map((f, i) => `
      <div style="background:#0f1117;border:1px solid #2d3148;border-radius:6px;padding:14px;margin-bottom:10px;">
        <div style="display:flex;gap:10px;">
          <div style="background:${sigColor}22;color:${sigColor};border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;font-weight:700;">${i + 1}</div>
          <div>
            <div style="font-size:13px;color:#e2e8f0;font-weight:500;">${escapeHtml(f.description)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">來源：${escapeHtml(f.source)}${f.sourceDate ? ' · ' + escapeHtml(fmtUtc(f.sourceDate)) : ''}</div>
          </div>
        </div>
      </div>`).join('')

  // Tab 4: News
  const newsCards = signalItems.length === 0
    ? `<div style="color:#64748b;font-size:13px;padding:24px 0;text-align:center;">（無可顯示之新聞項目）</div>`
    : signalItems.slice(0, 5).map(item => {
        const u      = safeUrl(item.url)
        const rLabel = item.ai_risk_label ? (RISK_ZH[item.ai_risk_label] ?? item.ai_risk_label) : null
        const rColor = item.ai_risk_label === 'Critical' ? '#ef4444'
          : item.ai_risk_label === 'High' ? '#f97316'
          : item.ai_risk_label === 'Medium' ? '#f59e0b' : '#10b981'
        const relLabel = item.relevance ? REL_LABEL[item.relevance] ?? item.relevance : null
        const relColor = item.relevance === 'direct'     ? '#10b981'
          : item.relevance === 'contextual' ? '#38bdf8' : '#64748b'
        const isLow    = item.relevance === 'low'
        return `<div style="background:#0f1117;border:1px solid #2d3148;border-radius:6px;padding:14px;margin-bottom:10px;${isLow ? 'opacity:0.7;' : ''}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              ${rLabel ? `<span style="background:${rColor}22;color:${rColor};border:1px solid ${rColor}55;border-radius:3px;padding:1px 6px;font-size:10px;font-weight:700;">${escapeHtml(rLabel)}</span>` : ''}
              ${item.ai_risk_score != null ? `<span style="font-size:11px;color:#94a3b8;">${item.ai_risk_score}</span>` : ''}
              ${relLabel ? `<span style="background:${relColor}18;color:${relColor};border:1px solid ${relColor}44;border-radius:3px;padding:1px 6px;font-size:10px;">${escapeHtml(relLabel)}</span>` : ''}
            </div>
            <span style="font-size:10px;background:#2d3148;color:#94a3b8;padding:2px 6px;border-radius:3px;">${escapeHtml(item.source)}</span>
          </div>
          <div style="font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:6px;">${escapeHtml(item.headline ?? '（無標題）')}</div>
          <div style="font-size:11px;color:#64748b;">${escapeHtml(fmtUtc(item.published_at))}${u ? ` · <a href="${escapeHtml(u)}" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;">查看原文 ↗</a>` : ''}</div>
        </div>`
      }).join('')

  const tab4 = `
    <div style="font-size:11px;color:#475569;margin-bottom:14px;padding:8px 12px;background:#1a1d27;border-radius:4px;">
      目前資料來源為 Finnhub 新聞文本；系統分析文本中的社群交易風險語言，尚未代表論壇社群討論熱度。納入計分：${escapeHtml(inp.newsCoverageText)}
    </div>
    ${newsCards}`

  // Tab 5: History
  function histCards(): string {
    if (histItems.length === 0) return `<div style="color:#64748b;font-size:13px;padding:24px 0;text-align:center;">（近期市場趨勢資料不足）</div>`
    const recent = histItems.slice(-5).reverse()
    return recent.map(h => {
      const rLabel = RISK_ZH[h.market_risk_label] ?? h.market_risk_label
      return `<div style="background:#0f1117;border:1px solid #2d3148;border-radius:6px;padding:12px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <span style="font-family:monospace;font-size:12px;color:#94a3b8;">${escapeHtml(h.date)}</span>
          <span style="font-size:11px;color:#e2e8f0;font-weight:600;">${escapeHtml(rLabel)}</span>
        </div>
        ${miniBar(h.market_heat_score, '市場熱度')}
        ${miniBar(h.volatility_anomaly_score, '波動異常')}
        ${miniBar(h.fomo_score, 'FOMO')}
        ${miniBar(h.short_squeeze_pressure, '軋空壓力')}
      </div>`
    }).join('')
  }

  const tab5 = histCards()

  // Tab 6: Methods
  const tab6 = `
    <div style="line-height:1.8;color:#94a3b8;font-size:13px;">
      <h3 style="color:#e2e8f0;font-size:14px;margin:0 0 12px;">資料來源</h3>
      <ul style="padding-left:18px;margin-bottom:16px;">
        <li>外部新聞文本訊號：Finnhub company-news API，系統使用 Model 1 分析文本中的社群交易風險語言</li>
        <li>最新市場快照：規則式市場計算（yfinance），包含社群炒作代理指標與波動性指標</li>
        <li>近期市場趨勢：規則式歷史每日序列（yfinance），依市場指標計算市場警戒訊號</li>
      </ul>
      <h3 style="color:#e2e8f0;font-size:14px;margin:0 0 12px;">計分方法</h3>
      <ul style="padding-left:18px;margin-bottom:16px;">
        <li>外部新聞文本訊號：去重後，依 ai_risk_score（0–95 尺度）或 ai_risk_label 計算平均</li>
        <li>最新市場快照：依 ai_risk_label 與市場指標分數加權平均</li>
        <li>近期市場趨勢：取最近五個交易日之市場熱度、波動異常、FOMO、軋空壓力加權平均</li>
        <li>綜合評分：依可取得來源動態歸一化權重計算</li>
      </ul>
      <h3 style="color:#e2e8f0;font-size:14px;margin:0 0 12px;">重要限制</h3>
      <ul style="padding-left:18px;margin-bottom:16px;">
        <li>外部新聞先依標的關聯性進行規則式篩選；低相關新聞不納入主要警戒計分，保留供查閱</li>
        <li>外部新聞文本模型係偵測社群交易風險語言，並非判斷新聞真偽，也不是預測股價</li>
        <li>完整（3 / 3）只代表目前已接入三類來源可取得，不代表已涵蓋所有可能資訊來源</li>
        <li>社群論壇資料（Reddit、X 等）尚未接入本階段摘要</li>
        <li>部分來源取得失敗時，摘要標示為「初步觀察」，結論參考性下降</li>
      </ul>
      <h3 style="color:#e2e8f0;font-size:14px;margin:0 0 12px;">非投資建議聲明</h3>
      <p>本報告用於觀察目前可取得資料中的警戒訊號強度，不構成投資建議、買賣建議、持倉建議或財務顧問服務，也不代表未來價格走勢。投資判斷仍應結合公司公告、財報、估值、風險承受能力與專業意見。</p>
    </div>`

  const tabContents = [
    ['summary', tab1, true],
    ['coverage', tab2, false],
    ['factors', tab3, false],
    ['news', tab4, false],
    ['history', tab5, false],
    ['methods', tab6, false],
  ] as [string, string, boolean][]

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>警戒摘要報告 · ${escapeHtml(symbol)}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f1117; color: #e2e8f0;
    font-family: -apple-system, 'Microsoft JhengHei', 'PingFang TC', sans-serif;
    font-size: 14px; line-height: 1.6; min-height: 100vh; }
  .container { max-width: 840px; margin: 0 auto; padding: 24px 16px; }
  .header { margin-bottom: 20px; }
  .header h1 { font-size: 18px; font-weight: 800; color: #fff; margin-bottom: 4px; }
  .header .meta { font-size: 12px; color: #64748b; }
  .disclaimer-strip {
    background: #1c1505; border: 1px solid #78350f;
    border-radius: 6px; padding: 8px 14px; margin-bottom: 18px;
    font-size: 11px; color: #fcd34d;
  }
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 16px; }
  .tab-btn {
    padding: 6px 14px; border-radius: 6px; border: 1px solid #2d3148;
    background: #1a1d27; color: #94a3b8; cursor: pointer;
    font-size: 12px; font-weight: 600; transition: all 0.15s;
  }
  .tab-btn:hover { background: #22263a; color: #e2e8f0; }
  .tab-btn.active { background: #1e3a5f; color: #38bdf8; border-color: #1d4ed8; }
  .tab-content { display: none; }
  .tab-content.active { display: block; }
  .footer-disclaimer {
    margin-top: 28px; padding: 12px 14px;
    background: #0f1117; border: 1px solid #2d3148; border-radius: 6px;
    font-size: 11px; color: #64748b; line-height: 1.7;
  }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>外部新聞與市場訊號綜合警戒摘要報告</h1>
    <div class="meta">股票代號：${escapeHtml(symbol)}　　生成時間：${escapeHtml(fmtUtc(caution.generatedAt))}</div>
  </div>
  <div class="disclaimer-strip">
    ⚠ 非投資建議 — 本報告用於觀察警戒訊號，不構成投資建議或買賣建議，也不代表未來價格走勢。
  </div>
  <nav class="tabs">
    ${tabBtns}
  </nav>
  ${tabContents.map(([id, html, active]) =>
    `<div id="${id}" class="tab-content${active ? ' active' : ''}">${html}</div>`
  ).join('\n')}
  <div class="footer-disclaimer">
    本報告整合目前可取得之外部新聞文本訊號與市場資料，用於觀察風險訊號強度，不構成投資建議，也不代表價格走勢。社群論壇資料尚未接入。投資判斷仍應結合公司公告、財報、估值、風險承受能力與專業意見。
  </div>
</div>
<script>
function showTab(id, btn) {
  document.querySelectorAll('.tab-content').forEach(function(el) { el.classList.remove('active'); });
  document.querySelectorAll('.tab-btn').forEach(function(el) { el.classList.remove('active'); });
  var content = document.getElementById(id);
  if (content) content.classList.add('active');
  if (btn) btn.classList.add('active');
}
</script>
</body>
</html>`
}

// ── File download helper ──────────────────────────────────────────────────────

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function copySummary(inp: BriefExportInput): Promise<void> {
  const text = buildSummaryText(inp)
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(text)
    return
  }
  // Fallback for older browsers
  const ta = Object.assign(document.createElement('textarea'), {
    value: text, style: { position: 'fixed', top: '-9999px' } as CSSStyleDeclaration,
  })
  document.body.appendChild(ta)
  ta.select()
  document.execCommand('copy')
  document.body.removeChild(ta)
}

export function downloadWord(inp: BriefExportInput): void {
  downloadFile(
    buildWordHtml(inp),
    `investor-caution-brief-${inp.symbol}.doc`,
    'application/msword;charset=utf-8',
  )
}

export function printReport(inp: BriefExportInput): void {
  const html = buildPrintHtml(inp)
  const win  = window.open('', '_blank', 'width=860,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  // Defer print so CSS/fonts render first
  setTimeout(() => { try { win.print() } catch (_) { /* ignore */ } }, 400)
}

export function downloadHtml(inp: BriefExportInput): void {
  downloadFile(
    buildFullHtml(inp),
    `investor-caution-brief-${inp.symbol}.html`,
    'text/html;charset=utf-8',
  )
}
