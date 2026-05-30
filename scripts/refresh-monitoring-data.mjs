#!/usr/bin/env node
/**
 * refresh-monitoring-data.mjs
 *
 * Scheduled refresh script — run by GitHub Actions every 6 hours.
 * For each monitored symbol:
 *   1. Fetches social-signals, market-snapshots, market-history from HF backend
 *   2. Validates payload (success=true, non-empty data), records fetch errors
 *   3. Computes caution summary (mirrors investorCaution.ts scoring logic)
 *   4. Merges result into history (max 7 entries, read from monitoring-previous.json)
 *   5. Writes aggregated JSON to generated-data/monitoring-latest.json
 *   (GitHub Actions FTPS-uploads that file to InfinityFree /htdocs/data/)
 *
 * Required env vars:
 *   HF_API_BASE  — e.g. https://your-space.hf.space
 *
 * JSON shape per symbol:
 *   symbols[SYM].latest            — last known-good result (preserved on failure)
 *   symbols[SYM].last_attempt_at   — timestamp of this run
 *   symbols[SYM].last_attempt_status — 'success'|'partial'|'error'
 *   symbols[SYM].last_attempt_errors — array of error strings
 *   symbols[SYM].history           — last 7 compact run entries (all statuses)
 *
 * overallStatus rules:
 *   'error'   — all symbols failed → exit(1), DO NOT write or upload JSON
 *   'partial' — at least one symbol has usable data but some failed
 *   'success' — all 8 symbols succeeded (no fetch errors)
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
    avg(recent.map(i => i.market_heat_score))        * 0.35 +
    avg(recent.map(i => i.volatility_anomaly_score)) * 0.35 +
    avg(recent.map(i => i.fomo_score))               * 0.15 +
    avg(recent.map(i => i.short_squeeze_pressure))   * 0.15
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
  const tw = wN + wS + wH; wN /= tw; wS /= tw; wH /= tw
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
    throw new Error(`${label} non-JSON: HTTP ${res.status}; content-type=${contentType}; body=${text.replace(/\s+/g, ' ').slice(0, 500)}`)
  }
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 300)}`)
  return data
}

async function fetchJson(url, label) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: AbortSignal.timeout(30_000) })
  return parseJsonResponse(res, label)
}

// ── Per-symbol fetch — returns the 'latest' payload shape ────────────────────
// fetchSymbol never throws; all errors are captured in fetch_errors.
// refresh_status is derived from fetch_errors after all three fetches:
//   'success': 0 errors       'partial': 1-2 errors       'error': 3 errors

async function fetchSymbol(symbol) {
  const fetchedAt = new Date().toISOString()
  let newsItems = [], fastapiSnapshot = null, histItems = []
  const fetchErrors = []

  // 1. Social signals (Finnhub news)
  try {
    const d = await fetchJson(`${HF_API_BASE}/api/v1/social-signals?symbol=${symbol}&sources=finnhub&limit=5`, `social-signals[${symbol}]`)
    if (d?.success === true && Array.isArray(d.items)) {
      newsItems = d.items
      if (newsItems.length === 0) console.log(`[refresh] ${symbol} social-signals: success=true but no items (valid)`)
    } else {
      const errDetail = d?.errors ? JSON.stringify(d.errors).slice(0, 120) : 'success=false'
      fetchErrors.push(`social-signals: ${errDetail}`)
    }
  } catch (e) { fetchErrors.push(`social-signals: ${e.message}`) }

  // 2. Market snapshot
  try {
    const d = await fetchJson(`${HF_API_BASE}/api/v1/market-snapshots?symbols=${symbol}`, `market-snapshots[${symbol}]`)
    if (d?.success === true && Array.isArray(d?.data?.snapshots)) {
      if (d.data.snapshots.length > 0) {
        fastapiSnapshot = d.data.snapshots[0]
      } else {
        fetchErrors.push(`market-snapshots: success=true but snapshots array empty`)
      }
    } else if (Array.isArray(d?.errors) && d.errors.length > 0) {
      fetchErrors.push(`market-snapshots: ${d.errors.map(e => e.error ?? '').join('; ').slice(0, 120)}`)
    } else {
      fetchErrors.push(`market-snapshots: success=false`)
    }
  } catch (e) { fetchErrors.push(`market-snapshots: ${e.message}`) }

  // 3. Market history
  try {
    const d = await fetchJson(`${HF_API_BASE}/api/v1/market-history?symbol=${symbol}&period=1mo`, `market-history[${symbol}]`)
    if (d?.success === true && Array.isArray(d.items)) {
      histItems = d.items
      if (histItems.length === 0) console.log(`[refresh] ${symbol} market-history: success=true but no items (valid for new ticker)`)
    } else {
      fetchErrors.push(`market-history: success=false`)
    }
  } catch (e) { fetchErrors.push(`market-history: ${e.message}`) }

  const summary = computeCautionSummary(newsItems, fastapiSnapshot, histItems, fetchedAt)

  // Status based on how many of the 3 sources failed
  const refresh_status = fetchErrors.length === 0 ? 'success'
    : fetchErrors.length < 3  ? 'partial'
    : 'error'

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

  // Load previous JSON to carry forward history and preserve latest on failure
  let previousJson = null
  try {
    const raw = await readFile(PREVIOUS_FILE, 'utf-8')
    previousJson = JSON.parse(raw)
    console.log('[refresh] Loaded previous JSON for history continuity')
  } catch {
    console.log('[refresh] No previous JSON found — starting fresh history')
  }

  // Fetch all symbols (fetchSymbol never throws; errors are in fetch_errors)
  const attemptBySymbol = {}
  let successCount = 0, partialCount = 0, errorCount = 0

  for (const symbol of SYMBOLS) {
    try {
      attemptBySymbol[symbol] = await fetchSymbol(symbol)
    } catch (unexpectedErr) {
      // Should not reach here since fetchSymbol catches all errors internally
      attemptBySymbol[symbol] = {
        fetched_at: new Date().toISOString(), refresh_status: 'error',
        fetch_errors: [`unexpected: ${unexpectedErr.message}`],
        summary: null, news_count: 0, items: [],
      }
    }

    const attempt = attemptBySymbol[symbol]
    if (attempt.refresh_status === 'success')      { successCount++; console.log(`[refresh] ${symbol} ✓ score=${attempt.summary?.combined_score ?? 'N/A'} news=${attempt.news_count}`) }
    else if (attempt.refresh_status === 'partial')  { partialCount++; console.warn(`[refresh] ${symbol} ⚠ partial — ${attempt.fetch_errors.join('; ')}`) }
    else                                             { errorCount++;  console.error(`[refresh] ${symbol} ✗ error — ${attempt.fetch_errors.join('; ')}`) }
  }

  console.log(`\n[refresh] Summary: ${successCount} success, ${partialCount} partial, ${errorCount} error`)

  // overallStatus: all-error → abort; any partial/error → partial; all success → success
  const overallStatus = errorCount === SYMBOLS.length ? 'error'
    : (partialCount > 0 || errorCount > 0) ? 'partial'
    : 'success'

  if (overallStatus === 'error') {
    console.error('[refresh] All symbols failed — aborting without writing output (no upload will occur)')
    process.exit(1)
  }

  // Build structured output per symbol
  const symbolsOutput = {}
  for (const symbol of SYMBOLS) {
    const attempt       = attemptBySymbol[symbol]
    const prevSymData   = previousJson?.symbols?.[symbol]
    const prevHistory   = prevSymData?.history ?? []

    // If this attempt failed, preserve the previous known-good latest so the
    // website still shows real data rather than an empty/null state.
    // The failure is recorded in last_attempt_* and history.
    const publishedLatest = attempt.refresh_status === 'error' && prevSymData?.latest
      ? prevSymData.latest        // keep last known-good data
      : attempt                   // use this run's result

    // Compact history entry (all runs, including failures)
    const historyEntry = {
      fetched_at:     attempt.fetched_at,
      refresh_status: attempt.refresh_status,
      summary: attempt.summary && attempt.refresh_status !== 'error' ? {
        signal_level:          attempt.summary.signal_level,
        combined_score:        attempt.summary.combined_score,
        data_coverage:         attempt.summary.data_coverage,
        interpretation_status: attempt.summary.interpretation_status,
      } : null,
    }

    symbolsOutput[symbol] = {
      latest:              publishedLatest,           // last known-good (frontend reads this)
      last_attempt_at:     attempt.fetched_at,        // when this run happened
      last_attempt_status: attempt.refresh_status,    // success | partial | error
      last_attempt_errors: attempt.fetch_errors,      // empty on success
      history:             [historyEntry, ...prevHistory].slice(0, MAX_HISTORY),
    }
  }

  const output = { generated_at: runStarted, refresh_status: overallStatus, symbols: symbolsOutput }

  await mkdir(OUTPUT_DIR, { recursive: true })
  await writeFile(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8')
  console.log(`[refresh] Output written to ${OUTPUT_FILE} (overallStatus=${overallStatus})`)
}

main().catch(err => {
  console.error('[refresh] Fatal error:', err)
  process.exit(1)
})
