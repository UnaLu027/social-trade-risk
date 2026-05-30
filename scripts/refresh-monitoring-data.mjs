#!/usr/bin/env node
/**
 * refresh-monitoring-data.mjs
 *
 * Scheduled refresh script — run by GitHub Actions every 6 hours.
 * For each monitored symbol:
 *   1. Fetches social-signals, market-snapshots, market-history from HF backend
 *   2. Computes caution summary (mirrors investorCaution.ts logic)
 *   3. Writes aggregated JSON to generated-data/monitoring-latest.json
 *   (GitHub Actions then FTP-uploads that file to InfinityFree /htdocs/data/)
 *
 * Required env vars:
 *   HF_API_BASE  — e.g. https://your-space.hf.space
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SYMBOLS     = ['GME', 'TSLA', 'AAPL', 'AMC', 'NVDA', 'MSFT', 'META', 'AMZN']
const HF_API_BASE = process.env.HF_API_BASE ?? ''
const OUTPUT_DIR  = 'generated-data'
const OUTPUT_FILE = join(OUTPUT_DIR, 'monitoring-latest.json')

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

function scoreSnapshot(fastapiSnapshot) {
  if (!fastapiSnapshot) return { score: 0 }
  const ls = labelScore(fastapiSnapshot.ai_risk_label)
  const fields = [
    fastapiSnapshot.social_hype_score,
    fastapiSnapshot.manipulation_signal_score,
    fastapiSnapshot.fomo_score,
    fastapiSnapshot.short_squeeze_pressure,
  ].filter(v => v != null)
  const numericAvg = fields.length > 0 ? avg(fields) : ls
  return { score: Math.min(100, Math.round(ls * 0.5 + numericAvg * 0.5)) }
}

function scoreHistory(items) {
  if (items.length === 0) return { score: 0 }
  const recent = items.slice(-5)
  const heatAvg = avg(recent.map(i => i.market_heat_score))
  const volAvg  = avg(recent.map(i => i.volatility_anomaly_score))
  const fomoAvg = avg(recent.map(i => i.fomo_score))
  const sqAvg   = avg(recent.map(i => i.short_squeeze_pressure))
  return { score: Math.min(100, Math.round(heatAvg * 0.35 + volAvg * 0.35 + fomoAvg * 0.15 + sqAvg * 0.15)) }
}

function computeCautionSummary(newsItems, fastapiSnapshot, histItems, generatedAt) {
  const newsR = scoreNews(newsItems)
  const snapR = scoreSnapshot(fastapiSnapshot)
  const histR = scoreHistory(histItems)

  const hasNews     = newsR.scoredCount > 0
  const hasSnapshot = !!fastapiSnapshot
  const hasHistory  = histItems.length > 0
  const sourceCount = [hasNews, hasSnapshot, hasHistory].filter(Boolean).length

  const dataCoverage =
    sourceCount === 3 ? 'FULL' :
    sourceCount === 2 ? 'PARTIAL' :
    sourceCount === 1 ? 'MINIMAL' : 'NONE'

  if (dataCoverage === 'NONE') {
    return {
      signal_level: 'insufficient_data', combined_score: 0,
      external_news_score: 0, latest_snapshot_score: 0, market_history_score: 0,
      data_coverage: 'NONE', interpretation_status: 'insufficient_data',
      coverage_note: '資料不足，無法產生警戒摘要。',
      source_count: 0, generated_at: generatedAt,
    }
  }

  let wNews = hasNews     ? 0.30 : 0
  let wSnap = hasSnapshot ? 0.35 : 0
  let wHist = hasHistory  ? 0.35 : 0
  const totalW = wNews + wSnap + wHist
  wNews /= totalW; wSnap /= totalW; wHist /= totalW

  const combinedScore = Math.round(newsR.score * wNews + snapR.score * wSnap + histR.score * wHist)
  const signalLevel =
    combinedScore >= 80 ? 'extreme' :
    combinedScore >= 60 ? 'high' :
    combinedScore >= 35 ? 'medium' : 'low'

  return {
    signal_level:          signalLevel,
    combined_score:        combinedScore,
    external_news_score:   Math.round(newsR.score),
    latest_snapshot_score: Math.round(snapR.score),
    market_history_score:  Math.round(histR.score),
    data_coverage:         dataCoverage,
    interpretation_status: dataCoverage === 'FULL' ? 'comprehensive' : 'preliminary',
    coverage_note:         dataCoverage !== 'FULL' ? '部分資料來源無法取得，摘要為初步觀察。' : '',
    source_count:          sourceCount,
    generated_at:          generatedAt,
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

/**
 * Reads the response body as text first, then attempts JSON.parse.
 * On failure, includes HTTP status, content-type and body preview in the error
 * so GitHub Actions logs show the exact response (e.g. HTML error pages).
 */
async function parseJsonResponse(res, label) {
  const contentType = res.headers.get('content-type') || ''
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 500)
    throw new Error(
      `${label} returned non-JSON: HTTP ${res.status}; content-type=${contentType}; body=${preview}`
    )
  }
  if (!res.ok) {
    throw new Error(`${label} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  }
  return data
}

async function fetchJson(url, label) {
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  })
  return parseJsonResponse(res, label)
}

// ── Per-symbol fetch ──────────────────────────────────────────────────────────

async function fetchSymbol(symbol) {
  const fetchedAt = new Date().toISOString()
  let newsItems = [], fastapiSnapshot = null, histItems = []
  const fetchErrors = []

  try {
    const data = await fetchJson(
      `${HF_API_BASE}/api/v1/social-signals?symbol=${symbol}&sources=finnhub&limit=5`,
      `social-signals[${symbol}]`
    )
    if (data?.success && Array.isArray(data.items)) newsItems = data.items
  } catch (err) {
    fetchErrors.push(`social-signals: ${err.message}`)
  }

  try {
    const data = await fetchJson(
      `${HF_API_BASE}/api/v1/market-snapshots?symbols=${symbol}`,
      `market-snapshots[${symbol}]`
    )
    if (data?.success && Array.isArray(data?.data?.snapshots) && data.data.snapshots.length > 0) {
      fastapiSnapshot = data.data.snapshots[0]
    }
  } catch (err) {
    fetchErrors.push(`market-snapshots: ${err.message}`)
  }

  try {
    const data = await fetchJson(
      `${HF_API_BASE}/api/v1/market-history?symbol=${symbol}&period=1mo`,
      `market-history[${symbol}]`
    )
    if (data?.success && Array.isArray(data.items) && data.items.length > 0) histItems = data.items
  } catch (err) {
    fetchErrors.push(`market-history: ${err.message}`)
  }

  const summary = computeCautionSummary(newsItems, fastapiSnapshot, histItems, fetchedAt)

  const refresh_status = fetchErrors.length === 0 ? 'success'
    : fetchErrors.length < 3 ? 'partial' : 'error'

  return {
    fetched_at:     fetchedAt,
    refresh_status,
    fetch_errors:   fetchErrors,
    summary,
    news_count:     newsItems.length,
    // include up to 5 items for potential future use; exclude full text to limit file size
    items:          newsItems.slice(0, 5).map(item => ({
      id:            item.id,
      headline:      item.headline,
      url:           item.url,
      published_at:  item.published_at,
      source:        item.source,
      ai_risk_label: item.ai_risk_label,
      ai_risk_score: item.ai_risk_score,
    })),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const runStarted = new Date().toISOString()
  console.log(`[refresh] Starting at ${runStarted}`)
  console.log(`[refresh] HF_API_BASE: ${HF_API_BASE}`)
  console.log(`[refresh] Symbols: ${SYMBOLS.join(', ')}`)

  const symbolResults = {}
  let successCount = 0, failCount = 0

  for (const symbol of SYMBOLS) {
    try {
      symbolResults[symbol] = await fetchSymbol(symbol)
      const r = symbolResults[symbol]
      console.log(`[refresh] ${symbol} ✓ status=${r.refresh_status} news=${r.news_count} score=${r.summary?.combined_score ?? 'N/A'}`)
      if (r.fetch_errors.length > 0) {
        console.warn(`[refresh] ${symbol} warnings: ${r.fetch_errors.join('; ')}`)
      }
      successCount++
    } catch (err) {
      console.error(`[refresh] ${symbol} ✗ ${err.message}`)
      symbolResults[symbol] = {
        fetched_at:     new Date().toISOString(),
        refresh_status: 'error',
        fetch_errors:   [err.message],
        summary:        null,
        news_count:     0,
        items:          [],
      }
      failCount++
    }
  }

  const overallStatus = failCount === SYMBOLS.length ? 'error'
    : failCount > 0 ? 'partial' : 'success'

  const output = {
    generated_at:   runStarted,
    refresh_status: overallStatus,
    symbols:        symbolResults,
  }

  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`\n[refresh] Done: ${successCount} succeeded, ${failCount} failed`)
  console.log(`[refresh] Output written to ${OUTPUT_FILE}`)

  // Fail the workflow only if ALL symbols failed (no usable data at all)
  if (overallStatus === 'error') {
    console.error('[refresh] All symbols failed — no data written')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[refresh] Fatal error:', err)
  process.exit(1)
})
