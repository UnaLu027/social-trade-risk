#!/usr/bin/env node
/**
 * refresh-monitoring-data.mjs
 *
 * Scheduled refresh script — run by GitHub Actions every 6 hours.
 * For each monitored symbol:
 *   1. Fetches social-signals, market-snapshots, market-history from HF backend
 *   2. Computes caution summary (mirrors investorCaution.ts logic exactly)
 *   3. POSTs batch to InfinityFree ingest_monitoring_batch.php with X-INGEST-KEY
 *
 * Required env vars:
 *   HF_API_BASE      — e.g. https://your-space.hf.space
 *   INGEST_ENDPOINT  — e.g. https://yoursite.infinityfreeapp.com/php-api/ingest_monitoring_batch.php
 *   INGEST_SECRET    — must match INGEST_SECRET defined in config.local.php
 */

const SYMBOLS = ['GME', 'TSLA', 'AAPL', 'AMC', 'NVDA', 'MSFT', 'META', 'AMZN']

const HF_API_BASE     = process.env.HF_API_BASE     ?? ''
const INGEST_ENDPOINT = process.env.INGEST_ENDPOINT ?? ''
const INGEST_SECRET   = process.env.INGEST_SECRET   ?? ''

if (!HF_API_BASE || !INGEST_ENDPOINT || !INGEST_SECRET) {
  console.error('[refresh] Missing required env vars: HF_API_BASE, INGEST_ENDPOINT, INGEST_SECRET')
  process.exit(1)
}

// ── Caution scoring — mirrors investorCaution.ts exactly ─────────────────────

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

function isHighOrCritical(label) {
  return label === 'Critical' || label === 'High'
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

  const interpretationStatus = dataCoverage === 'FULL' ? 'comprehensive' : 'preliminary'

  return {
    signal_level:          signalLevel,
    combined_score:        combinedScore,
    external_news_score:   Math.round(newsR.score),
    latest_snapshot_score: Math.round(snapR.score),
    market_history_score:  Math.round(histR.score),
    data_coverage:         dataCoverage,
    interpretation_status: interpretationStatus,
    coverage_note:         dataCoverage !== 'FULL' ? '部分資料來源無法取得，摘要為初步觀察。' : '',
    source_count:          sourceCount,
    generated_at:          generatedAt,
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function fetchJson(url, label) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${label}`)
  return res.json()
}

async function postIngest(symbol, payload) {
  const res = await fetch(INGEST_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'X-INGEST-KEY':  INGEST_SECRET,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ingest HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// ── Per-symbol refresh ────────────────────────────────────────────────────────

async function refreshSymbol(symbol) {
  const generatedAt = new Date().toISOString()
  let newsItems = [], fastapiSnapshot = null, histItems = []
  let fetchErrors = []

  // Fetch social signals (Finnhub news)
  try {
    const data = await fetchJson(
      `${HF_API_BASE}/api/v1/social-signals?symbol=${symbol}&sources=finnhub&limit=5`,
      'social-signals'
    )
    if (data?.success && Array.isArray(data.items)) newsItems = data.items
  } catch (err) {
    fetchErrors.push(`social-signals: ${err.message}`)
  }

  // Fetch market snapshot
  try {
    const data = await fetchJson(
      `${HF_API_BASE}/api/v1/market-snapshots?symbols=${symbol}`,
      'market-snapshots'
    )
    if (data?.success && Array.isArray(data?.data?.snapshots) && data.data.snapshots.length > 0) {
      fastapiSnapshot = data.data.snapshots[0]
    }
  } catch (err) {
    fetchErrors.push(`market-snapshots: ${err.message}`)
  }

  // Fetch market history
  try {
    const data = await fetchJson(
      `${HF_API_BASE}/api/v1/market-history?symbol=${symbol}&period=1mo`,
      'market-history'
    )
    if (data?.success && Array.isArray(data.items) && data.items.length > 0) histItems = data.items
  } catch (err) {
    fetchErrors.push(`market-history: ${err.message}`)
  }

  const summary = computeCautionSummary(newsItems, fastapiSnapshot, histItems, generatedAt)

  const refresh_status = fetchErrors.length === 0 ? 'success'
    : fetchErrors.length < 3 ? 'partial'
    : 'error'

  const payload = {
    symbol,
    fetched_at:      generatedAt,
    refresh_status,
    error_message:   fetchErrors.length > 0 ? fetchErrors.join('; ') : null,
    items:           newsItems,
    summary,
  }

  const result = await postIngest(symbol, payload)
  return { symbol, refresh_status, fetchErrors, ingestResult: result?.data }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[refresh] Starting monitoring refresh for ${SYMBOLS.length} symbols`)
  console.log(`[refresh] HF_API_BASE: ${HF_API_BASE}`)
  console.log(`[refresh] INGEST_ENDPOINT: ${INGEST_ENDPOINT}`)
  // INGEST_SECRET intentionally NOT logged

  const results = []
  for (const symbol of SYMBOLS) {
    try {
      const r = await refreshSymbol(symbol)
      results.push({ symbol, ok: true, status: r.refresh_status, fetchErrors: r.fetchErrors })
      const newsCount = r.ingestResult?.news_inserted ?? '?'
      console.log(`[refresh] ${symbol} ✓ status=${r.refresh_status} news_inserted=${newsCount}`)
      if (r.fetchErrors.length > 0) {
        console.warn(`[refresh] ${symbol} fetch warnings: ${r.fetchErrors.join(', ')}`)
      }
    } catch (err) {
      results.push({ symbol, ok: false, error: err.message })
      console.error(`[refresh] ${symbol} ✗ ${err.message}`)
    }
  }

  const succeeded = results.filter(r => r.ok).length
  const failed    = results.filter(r => !r.ok).length
  console.log(`\n[refresh] Done: ${succeeded} succeeded, ${failed} failed`)

  if (failed > 0) {
    console.log('[refresh] Failed symbols:')
    results.filter(r => !r.ok).forEach(r => console.log(`  - ${r.symbol}: ${r.error}`))
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[refresh] Fatal error:', err)
  process.exit(1)
})
