#!/usr/bin/env node
/**
 * refresh-monitoring-data.mjs
 *
 * Scheduled refresh script — run by GitHub Actions every 6 hours.
 * For each monitored symbol:
 *   1. Fetches social-signals, market-snapshots, market-history from HF backend
 *   2. Computes caution summary (mirrors investorCaution.ts scoring logic)
 *   3. Merges result into history (max 7 entries, read from monitoring-previous.json)
 *   4. Writes aggregated JSON to generated-data/monitoring-latest.json
 *   (GitHub Actions FTP-uploads that file to InfinityFree /htdocs/data/)
 *
 * Required env vars:
 *   HF_API_BASE  — e.g. https://your-space.hf.space
 *
 * Output shape per symbol:
 *   symbols[SYMBOL].latest   — full result of this run (summary + items)
 *   symbols[SYMBOL].history  — last 7 runs, summary only (no items)
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const SYMBOLS       = ['GME', 'TSLA', 'AAPL', 'AMC', 'NVDA', 'MSFT', 'META', 'AMZN']
const HF_API_BASE   = process.env.HF_API_BASE ?? ''
const OUTPUT_DIR    = 'generated-data'
const OUTPUT_FILE   = join(OUTPUT_DIR, 'monitoring-latest.json')
const PREVIOUS_FILE = join(OUTPUT_DIR, 'monitoring-previous.json')
const MAX_HISTORY   = 7

if (!HF_API_BASE) {
  console.error('[refresh] Missing required env var: HF_API_BASE')
  process.exit(1)
}

// ── Caution scoring — mirrors investorCaution.ts ──────────────────────────────

function labelScore(label) {
  switch (label) {
    case 'Critical': return 100
    case 'High':     return 75
    case 'Medium':   return 50
    case 'Low':      return 25
    default:         return 0
  }
}

function normalizeRiskScore(value, label) {
  if (value == null || !Number.isFinite(value)) return labelScore(label)
  const normalized = value > 0 && value <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, normalized))
}

function avg(values) {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function isScoredItem(item) {
  const hasValidScore = item.ai_risk_score != null && Number.isFinite(item.ai_risk_score) && item.ai_risk_score > 0
  const hasValidLabel = ['Low', 'Medium', 'High', 'Critical'].includes(item.ai_risk_label)
  return hasValidScore || hasValidLabel
}

function scoreNews(items) {
  if (items.length === 0) return { score: 0, rawCount: 0, scoredCount: 0 }
  const seenUrls = new Set(), seenHeadlines = new Set(), unique = []
  for (const item of items) {
    const urlKey      = item.url ?? ''
    const headlineKey = (item.headline ?? '').toLowerCase().trim()
    if (urlKey && seenUrls.has(urlKey)) continue
    if (headlineKey && seenHeadlines.has(headlineKey)) continue
    if (urlKey) seenUrls.add(urlKey)
    if (headlineKey) seenHeadlines.add(headlineKey)
    unique.push(item)
  }
  const scored = unique.filter(isScoredItem)
  if (scored.length === 0) return { score: 0, rawCount: items.length, scoredCount: 0 }
  const scores = scored.map(i => normalizeRiskScore(i.ai_risk_score, i.ai_risk_label))
  return { score: Math.min(100, avg(scores)), rawCount: items.length, scoredCount: scored.length }
}

function scoreSnapshot(snap) {
  if (!snap) return { score: 0 }
  const ls = labelScore(snap.ai_risk_label)
  const fields = [snap.social_hype_score, snap.manipulation_signal_score, snap.fomo_score, snap.short_squeeze_pressure].filter(v => v != null)
  const numericAvg = fields.length > 0 ? avg(fields) : ls
  return { score: Math.min(100, Math.round(ls * 0.5 + numericAvg * 0.5)) }
}

function scoreHistory(items) {
  if (items.length === 0) return { score: 0 }
  const recent = items.slice(-5)
  return { score: Math.min(100, Math.round(
    avg(recent.map(i => i.market_heat_score))       * 0.35 +
    avg(recent.map(i => i.volatility_anomaly_score)) * 0.35 +
    avg(recent.map(i => i.fomo_score))              * 0.15 +
    avg(recent.map(i => i.short_squeeze_pressure))  * 0.15
  ))}
}

function computeCautionSummary(newsItems, fastapiSnapshot, histItems, generatedAt) {
  const newsR = scoreNews(newsItems)
  const snapR = scoreSnapshot(fastapiSnapshot)
  const histR = scoreHistory(histItems)
  const hasNews = newsR.scoredCount > 0, hasSnap = !!fastapiSnapshot, hasHist = histItems.length > 0
  const sourceCount = [hasNews, hasSnap, hasHist].filter(Boolean).length
  const dataCoverage = sourceCount === 3 ? 'FULL' : sourceCount === 2 ? 'PARTIAL' : sourceCount === 1 ? 'MINIMAL' : 'NONE'

  if (dataCoverage === 'NONE') {
    return { signal_level: 'insufficient_data', combined_score: 0, external_news_score: 0, latest_snapshot_score: 0, market_history_score: 0, data_coverage: 'NONE', interpretation_status: 'insufficient_data', coverage_note: '資料不足，無法產生警戒摘要。', source_count: 0, generated_at: generatedAt }
  }

  let wN = hasNews ? 0.30 : 0, wS = hasSnap ? 0.35 : 0, wH = hasHist ? 0.35 : 0
  const tw = wN + wS + wH;  wN /= tw;  wS /= tw;  wH /= tw
  const combined = Math.round(newsR.score * wN + snapR.score * wS + histR.score * wH)
  const signal_level = combined >= 80 ? 'extreme' : combined >= 60 ? 'high' : combined >= 35 ? 'medium' : 'low'

  return {
    signal_level, combined_score: combined,
    external_news_score:   Math.round(newsR.score),
    latest_snapshot_score: Math.round(snapR.score),
    market_history_score:  Math.round(histR.score),
    data_coverage: dataCoverage,
    interpretation_status: dataCoverage === 'FULL' ? 'comprehensive' : 'preliminary',
    coverage_note: dataCoverage !== 'FULL' ? '部分資料來源無法取得，摘要為初步觀察。' : '',
    source_count: sourceCount, generated_at: generatedAt,
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function parseJsonResponse(res, label) {
  const contentType = res.headers.get('content-type') || ''
  const text = await res.text()
  let data
  try { data = JSON.parse(text) } catch {
    throw new Error(`${label} returned non-JSON: HTTP ${res.status}; content-type=${contentType}; body=${text.replace(/\s+/g, ' ').slice(0, 500)}`)
  }
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  return data
}

async function fetchJson(url, label) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(30_000) })
  return parseJsonResponse(res, label)
}

// ── Per-symbol fetch — returns the 'latest' payload ───────────────────────────

async function fetchSymbol(symbol) {
  const fetchedAt = new Date().toISOString()
  let newsItems = [], fastapiSnapshot = null, histItems = []
  const fetchErrors = []

  try {
    const d = await fetchJson(`${HF_API_BASE}/api/v1/social-signals?symbol=${symbol}&sources=finnhub&limit=5`, `social-signals[${symbol}]`)
    if (d?.success && Array.isArray(d.items)) newsItems = d.items
  } catch (e) { fetchErrors.push(`social-signals: ${e.message}`) }

  try {
    const d = await fetchJson(`${HF_API_BASE}/api/v1/market-snapshots?symbols=${symbol}`, `market-snapshots[${symbol}]`)
    if (d?.success && Array.isArray(d?.data?.snapshots) && d.data.snapshots.length > 0) fastapiSnapshot = d.data.snapshots[0]
  } catch (e) { fetchErrors.push(`market-snapshots: ${e.message}`) }

  try {
    const d = await fetchJson(`${HF_API_BASE}/api/v1/market-history?symbol=${symbol}&period=1mo`, `market-history[${symbol}]`)
    if (d?.success && Array.isArray(d.items) && d.items.length > 0) histItems = d.items
  } catch (e) { fetchErrors.push(`market-history: ${e.message}`) }

  const summary = computeCautionSummary(newsItems, fastapiSnapshot, histItems, fetchedAt)
  const refresh_status = fetchErrors.length === 0 ? 'success' : fetchErrors.length < 3 ? 'partial' : 'error'

  return {
    fetched_at:     fetchedAt,
    refresh_status,
    fetch_errors:   fetchErrors,
    summary,
    news_count:     newsItems.length,
    items:          newsItems.slice(0, 5).map(({ id, headline, url, published_at, source, ai_risk_label, ai_risk_score }) =>
      ({ id, headline, url, published_at, source, ai_risk_label, ai_risk_score })
    ),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const runStarted = new Date().toISOString()
  console.log(`[refresh] Starting at ${runStarted}`)
  console.log(`[refresh] HF_API_BASE: ${HF_API_BASE}`)
  console.log(`[refresh] Symbols: ${SYMBOLS.join(', ')}`)

  // Load previous JSON to carry forward history
  let previousJson = null
  try {
    const raw = await readFile(PREVIOUS_FILE, 'utf-8')
    previousJson = JSON.parse(raw)
    console.log('[refresh] Loaded previous JSON for history continuity')
  } catch {
    console.log('[refresh] No previous JSON found — starting fresh history')
  }

  // Fetch all symbols (independent; one failure does not stop others)
  const latestBySymbol = {}
  let successCount = 0, failCount = 0

  for (const symbol of SYMBOLS) {
    try {
      latestBySymbol[symbol] = await fetchSymbol(symbol)
      const r = latestBySymbol[symbol]
      console.log(`[refresh] ${symbol} ✓ status=${r.refresh_status} news=${r.news_count} score=${r.summary?.combined_score ?? 'N/A'}`)
      if (r.fetch_errors.length > 0) console.warn(`[refresh] ${symbol} warnings: ${r.fetch_errors.join('; ')}`)
      successCount++
    } catch (err) {
      console.error(`[refresh] ${symbol} ✗ ${err.message}`)
      latestBySymbol[symbol] = {
        fetched_at: new Date().toISOString(), refresh_status: 'error',
        fetch_errors: [err.message], summary: null, news_count: 0, items: [],
      }
      failCount++
    }
  }

  // Build structured output: latest + history per symbol
  const symbolsOutput = {}
  for (const symbol of SYMBOLS) {
    const latest      = latestBySymbol[symbol]
    const prevHistory = previousJson?.symbols?.[symbol]?.history ?? []

    // Compact history entry (summary only, no items, to control file size)
    const historyEntry = {
      fetched_at:     latest.fetched_at,
      refresh_status: latest.refresh_status,
      summary: latest.summary ? {
        signal_level:          latest.summary.signal_level,
        combined_score:        latest.summary.combined_score,
        data_coverage:         latest.summary.data_coverage,
        interpretation_status: latest.summary.interpretation_status,
      } : null,
    }

    symbolsOutput[symbol] = {
      latest,
      history: [historyEntry, ...prevHistory].slice(0, MAX_HISTORY),
    }
  }

  const overallStatus = failCount === SYMBOLS.length ? 'error' : failCount > 0 ? 'partial' : 'success'
  const output = { generated_at: runStarted, refresh_status: overallStatus, symbols: symbolsOutput }

  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8')

  console.log(`\n[refresh] Done: ${successCount} succeeded, ${failCount} failed`)
  console.log(`[refresh] Output written to ${OUTPUT_FILE}`)

  if (overallStatus === 'error') {
    console.error('[refresh] All symbols failed')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[refresh] Fatal error:', err)
  process.exit(1)
})
