#!/usr/bin/env node
/**
 * refresh-monitoring-data.mjs
 *
 * Scheduled refresh script — run by GitHub Actions every 6 hours.
 * For each monitored symbol:
 *   1. Fetches a candidate pool of social-signals, market-snapshots, and
 *      market-history from the HF backend.
 *   2. Applies a relevance gate (news-relevance.mjs) so only symbol-relevant
 *      Finnhub articles contribute to scoring and are published in the JSON.
 *   3. Validates payload (success=true, non-empty data), records fetch errors.
 *   4. Computes caution summary (mirrors investorCaution.ts scoring logic)
 *      using only relevant news items.
 *   5. Merges result into history (max 7 entries, read from monitoring-previous.json).
 *   6. Writes aggregated JSON to generated-data/monitoring-latest.json.
 *      GitHub Actions commits the file back to the repository; the frontend
 *      reads the JSON directly from the GitHub raw content URL.
 *
 * Required env vars:
 *   HF_API_BASE  — e.g. https://your-space.hf.space
 *
 * Candidate / publish limits (verified against live HF endpoint):
 *   CANDIDATE_NEWS_LIMIT = 20  — items requested from the HF API per symbol
 *   PUBLISHED_NEWS_LIMIT = 10  — max relevant items stored in output JSON
 *
 * JSON shape per symbol:
 *   symbols[SYM].latest            — last known-good result (preserved on failure)
 *   symbols[SYM].last_attempt_at   — timestamp of this run
 *   symbols[SYM].last_attempt_status — 'success'|'partial'|'error'
 *   symbols[SYM].last_attempt_errors — array of error strings
 *   symbols[SYM].history           — last 7 compact run entries (all statuses)
 *
 * Per-symbol latest.items shape (published relevant news):
 *   id, headline, url, published_at, source, ai_risk_label, ai_risk_score,
 *   relevance_basis, matched_terms
 *   (summary is excluded from the stored JSON)
 *
 * Per-symbol latest audit fields:
 *   news_count                — published relevant unique count (backward-compat)
 *   candidate_news_count      — total items returned by HF API
 *   relevant_news_count       — items passing the relevance gate (before dedup)
 *   unique_relevant_news_count — relevant items after URL/headline deduplication
 *   duplicate_news_count      — relevant items removed as duplicates
 *   published_news_count      — items written to JSON (≤ PUBLISHED_NEWS_LIMIT)
 *   excluded_news_count       — candidate items rejected for relevance only
 *
 * overallStatus rules:
 *   'error'   — all symbols failed → exit(1), DO NOT write or upload JSON
 *   'partial' — at least one symbol has usable data but some failed
 *   'success' — all 8 symbols succeeded (no fetch errors)
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { filterRelevantNews, deduplicateNewsItems } from './news-relevance.mjs'

const SYMBOLS              = ['GME', 'TSLA', 'AAPL', 'AMC', 'NVDA', 'MSFT', 'META', 'AMZN']
const HF_API_BASE          = process.env.HF_API_BASE ?? ''
const OUTPUT_DIR           = 'generated-data'
const OUTPUT_FILE          = join(OUTPUT_DIR, 'monitoring-latest.json')
const PREVIOUS_FILE        = join(OUTPUT_DIR, 'monitoring-previous.json')
const MAX_HISTORY          = 7
// Verified 2026-05-30: live HF endpoint returns up to 20 items at limit=20
// (GME: 15, NVDA/MSFT/AMZN: 20). Limit=20 is supported.
const CANDIDATE_NEWS_LIMIT = 20
const PUBLISHED_NEWS_LIMIT = 10

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

// scoreNews receives already-filtered relevant items; it deduplicates internally.
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

// ── Abnormal return computation ────────────────────────────────────────────────

function computeReturn(hist, nDays) {
  if (!Array.isArray(hist) || hist.length < nDays + 1) return null
  const sorted = [...hist].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const latest = sorted[sorted.length - 1]?.close
  const prior  = sorted[sorted.length - 1 - nDays]?.close
  if (latest == null || prior == null || prior === 0) return null
  return Math.round((latest - prior) / prior * 10000) / 10000
}

function computeAbnormalReturn(stockHist, benchHist) {
  const stockReturn1d = computeReturn(stockHist, 1)
  const stockReturn5d = computeReturn(stockHist, 5)
  const benchReturn1d = computeReturn(benchHist, 1)
  const benchReturn5d = computeReturn(benchHist, 5)

  const ar1d = stockReturn1d !== null && benchReturn1d !== null
    ? Math.round((stockReturn1d - benchReturn1d) * 10000) / 10000
    : null
  const ar5d = stockReturn5d !== null && benchReturn5d !== null
    ? Math.round((stockReturn5d - benchReturn5d) * 10000) / 10000
    : null

  const interpretation = ar5d === null
    ? 'insufficient_data'
    : ar5d >  0.05 ? 'outperforming'
    : ar5d < -0.05 ? 'underperforming'
    : 'neutral'

  const insufficientStock = !Array.isArray(stockHist) || stockHist.length < 2
    || (stockReturn1d === null && stockReturn5d === null)
  const insufficientBench = !Array.isArray(benchHist) || benchHist.length < 2
    || (benchReturn1d === null && benchReturn5d === null)

  const data_quality = insufficientStock
    ? 'insufficient_stock_data'
    : insufficientBench
    ? 'insufficient_benchmark_data'
    : 'computed_from_market_history'

  return {
    benchmark_symbol:    'SPY',
    stock_return_1d:     stockReturn1d,
    benchmark_return_1d: benchReturn1d,
    abnormal_return_1d:  ar1d,
    stock_return_5d:     stockReturn5d,
    benchmark_return_5d: benchReturn5d,
    abnormal_return_5d:  ar5d,
    interpretation,
    data_quality,
  }
}

// relevantNewsItems: already gated by filterRelevantNews; scoreNews deduplicates internally.
function computeCautionSummary(relevantNewsItems, fastapiSnapshot, histItems, generatedAt) {
  const newsR = scoreNews(relevantNewsItems)
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

// ── Per-symbol fetch ──────────────────────────────────────────────────────────
// Data flow:
//   candidateNewsItems     = raw items from HF social-signals API
//   relevantNewsItems      = filterRelevantNews(candidateNewsItems, symbol)
//   uniqueRelevantNewsItems = deduplicateNewsItems(relevantNewsItems)
//   computeCautionSummary(uniqueRelevantNewsItems, ...)
//   publishedNewsItems     = uniqueRelevantNewsItems.slice(0, PUBLISHED_NEWS_LIMIT)
//
// Deduplication is applied before scoring so caution scores and the published
// item list are both free of duplicate articles.
// If the API succeeds but zero candidates are relevant, no fetch error is
// recorded; snapshot and history sources carry the full caution score weight.

async function fetchSymbol(symbol, spyHistItems = []) {
  const fetchedAt = new Date().toISOString()
  let candidateNewsItems = [], fastapiSnapshot = null, histItems = []
  const fetchErrors = []

  // 1. Social signals (Finnhub news) — fetch a larger candidate pool
  try {
    const d = await fetchJson(
      `${HF_API_BASE}/api/v1/social-signals?symbol=${symbol}&sources=finnhub&limit=${CANDIDATE_NEWS_LIMIT}`,
      `social-signals[${symbol}]`
    )
    if (d?.success === true && Array.isArray(d.items)) {
      candidateNewsItems = d.items
      if (candidateNewsItems.length === 0) {
        console.log(`[refresh] ${symbol} social-signals: success=true but no items (valid)`)
      }
    } else {
      const errDetail = d?.errors ? JSON.stringify(d.errors).slice(0, 120) : 'success=false'
      fetchErrors.push(`social-signals: ${errDetail}`)
    }
  } catch (e) { fetchErrors.push(`social-signals: ${e.message}`) }

  // Apply relevance gate then deduplicate before scoring and publishing.
  // summary is available here (from HF API) for matching but is not stored.
  const relevantNewsItems      = filterRelevantNews(candidateNewsItems, symbol)
  const uniqueRelevantNewsItems = deduplicateNewsItems(relevantNewsItems)
  const excludedNewsCount      = candidateNewsItems.length - relevantNewsItems.length
  const duplicateNewsCount     = relevantNewsItems.length - uniqueRelevantNewsItems.length
  const publishedNewsItems     = uniqueRelevantNewsItems.slice(0, PUBLISHED_NEWS_LIMIT)

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

  // Caution score is computed from unique relevant items only
  const summary = computeCautionSummary(uniqueRelevantNewsItems, fastapiSnapshot, histItems, fetchedAt)

  // Abnormal return vs SPY benchmark
  const abnormal_return = computeAbnormalReturn(histItems, spyHistItems)

  // Status based on how many of the 3 sources failed (zero relevant news is not a failure)
  const refresh_status = fetchErrors.length === 0 ? 'success'
    : fetchErrors.length < 3  ? 'partial'
    : 'error'

  return {
    fetched_at:     fetchedAt,
    refresh_status,
    fetch_errors:   fetchErrors,
    summary,
    abnormal_return,
    // news_count: published unique relevant count (backward-compatible field)
    news_count:                  publishedNewsItems.length,
    // Audit fields for observability
    candidate_news_count:        candidateNewsItems.length,
    relevant_news_count:         relevantNewsItems.length,
    unique_relevant_news_count:  uniqueRelevantNewsItems.length,
    duplicate_news_count:        duplicateNewsCount,
    published_news_count:        publishedNewsItems.length,
    excluded_news_count:         excludedNewsCount,
    // Published items include relevance metadata; summary is excluded from stored JSON
    items: publishedNewsItems.map(({
      id, headline, url, published_at, source,
      ai_risk_label, ai_risk_score,
      relevance_basis, matched_terms,
    }) => ({
      id, headline, url, published_at, source,
      ai_risk_label, ai_risk_score,
      relevance_basis, matched_terms,
    })),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const runStarted = new Date().toISOString()
  console.log(`[refresh] Starting at ${runStarted}`)
  console.log(`[refresh] HF_API_BASE: ${HF_API_BASE}`)
  console.log(`[refresh] Symbols: ${SYMBOLS.join(', ')}`)
  console.log(`[refresh] Candidate limit: ${CANDIDATE_NEWS_LIMIT}, Publish limit: ${PUBLISHED_NEWS_LIMIT}`)

  // Load previous JSON to carry forward history and preserve latest on failure
  let previousJson = null
  try {
    const raw = await readFile(PREVIOUS_FILE, 'utf-8')
    previousJson = JSON.parse(raw)
    console.log('[refresh] Loaded previous JSON for history continuity')
  } catch {
    console.log('[refresh] No previous JSON found — starting fresh history')
  }

  // Fetch SPY benchmark data once for abnormal return computation (never throws)
  let spyHistItems = []
  try {
    const d = await fetchJson(
      `${HF_API_BASE}/api/v1/market-history?symbol=SPY&period=1mo`,
      'market-history[SPY]'
    )
    if (d?.success === true && Array.isArray(d.items) && d.items.length > 0) {
      spyHistItems = d.items
      console.log(`[refresh] SPY benchmark: ${spyHistItems.length} history items`)
    } else {
      console.warn('[refresh] SPY benchmark: no history items — abnormal_return will be null for all symbols')
    }
  } catch (e) {
    console.warn(`[refresh] SPY benchmark fetch failed: ${e.message} — abnormal_return will be null for all symbols`)
  }

  // Fetch all symbols (fetchSymbol never throws; errors are in fetch_errors)
  const attemptBySymbol = {}
  let successCount = 0, partialCount = 0, errorCount = 0

  for (const symbol of SYMBOLS) {
    try {
      attemptBySymbol[symbol] = await fetchSymbol(symbol, spyHistItems)
    } catch (unexpectedErr) {
      attemptBySymbol[symbol] = {
        fetched_at: new Date().toISOString(), refresh_status: 'error',
        fetch_errors: [`unexpected: ${unexpectedErr.message}`],
        summary: null,
        abnormal_return: null,
        news_count: 0, candidate_news_count: 0, relevant_news_count: 0,
        published_news_count: 0, excluded_news_count: 0,
        items: [],
      }
    }

    const attempt = attemptBySymbol[symbol]
    const relevanceInfo = `cand=${attempt.candidate_news_count} rel=${attempt.relevant_news_count} uniq=${attempt.unique_relevant_news_count} dup=${attempt.duplicate_news_count} pub=${attempt.published_news_count} excl=${attempt.excluded_news_count}`
    if (attempt.refresh_status === 'success') {
      successCount++
      console.log(`[refresh] ${symbol} ✓ score=${attempt.summary?.combined_score ?? 'N/A'} news=${attempt.news_count} (${relevanceInfo})`)
    } else if (attempt.refresh_status === 'partial') {
      partialCount++
      console.warn(`[refresh] ${symbol} ⚠ partial — ${attempt.fetch_errors.join('; ')} (${relevanceInfo})`)
    } else {
      errorCount++
      console.error(`[refresh] ${symbol} ✗ error — ${attempt.fetch_errors.join('; ')}`)
    }
  }

  console.log(`\n[refresh] Summary: ${successCount} success, ${partialCount} partial, ${errorCount} error`)

  const overallStatus = errorCount === SYMBOLS.length ? 'error'
    : (partialCount > 0 || errorCount > 0) ? 'partial'
    : 'success'

  if (overallStatus === 'error') {
    console.error('[refresh] All symbols failed — aborting without writing output')
    process.exit(1)
  }

  // Build structured output per symbol
  const symbolsOutput = {}
  for (const symbol of SYMBOLS) {
    const attempt       = attemptBySymbol[symbol]
    const prevSymData   = previousJson?.symbols?.[symbol]
    const prevHistory   = prevSymData?.history ?? []

    const publishedLatest = attempt.refresh_status === 'error' && prevSymData?.latest
      ? prevSymData.latest
      : attempt

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
      latest:              publishedLatest,
      last_attempt_at:     attempt.fetched_at,
      last_attempt_status: attempt.refresh_status,
      last_attempt_errors: attempt.fetch_errors,
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
