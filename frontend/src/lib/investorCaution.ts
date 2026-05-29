// Rule-based investor caution summary
// Data source: Finnhub external news text signals + FastAPI market data
// NOT social forum/Reddit signals

export type SignalLevel = 'low' | 'medium' | 'high' | 'extreme' | 'insufficient_data'
export type DataCoverageLevel = 'FULL' | 'PARTIAL' | 'MINIMAL' | 'NONE'
export type InterpretationStatus = 'comprehensive' | 'preliminary' | 'insufficient_data'

// Risk label → Chinese mapping (exported for use in UI)
export const RISK_LABEL_ZH: Record<string, string> = {
  Low:      '低警戒',
  Medium:   '中警戒',
  High:     '高警戒',
  Critical: '極高警戒',
}

export interface CautionFactor {
  description: string
  source: string
  sourceDate?: string
}

export interface CautionOptions {
  externalNewsError?: boolean
  latestSnapshotError?: boolean
  marketHistoryError?: boolean
}

export interface InvestorCautionResult {
  signalLevel: SignalLevel
  score: number
  scoreBreakdown: {
    externalNews: number
    latestMarketSnapshot: number
    marketHistory: number
  }
  dataCoverage: DataCoverageLevel
  interpretationStatus: InterpretationStatus
  coverageNote: string
  keyFactors: CautionFactor[]
  newsCoverage: {
    rawCount: number
    uniqueCount: number
    scoredCount: number
  }
  generatedAt: string
}

// ── Input shape contracts (structural, compatible with RiskReport local types) ─

interface NewsSignalInput {
  id: string
  url: string | null
  headline: string | null
  ai_risk_label: string | null
  ai_risk_score: number | null
  published_at: string
}

interface SnapshotInput {
  snapshot_date: string
  social_hype_score: number | null
  manipulation_signal_score: number | null
  fomo_score: number | null
  short_squeeze_pressure: number | null
  ai_risk_label: string | null
}

interface HistoryInput {
  date: string
  market_heat_score: number
  volatility_anomaly_score: number
  fomo_score: number
  short_squeeze_pressure: number
  market_risk_label: string
}

// ── helpers ───────────────────────────────────────────────────────────────────

function labelScore(label: string | null): number {
  switch (label) {
    case 'Critical': return 100
    case 'High':     return 75
    case 'Medium':   return 50
    case 'Low':      return 25
    default:         return 0
  }
}

// ai_risk_score from backend: risk_score_from_probs() returns 0–95 scale.
// Valid classifications produce ~15 (Low) to ~95 (Critical); failures return 0.0.
// Defensive normalizer: treats 0<value≤1 as 0–1 probability scale (future-proofing),
// treats value>1 as already 0–100 scale (current backend behaviour).
export function normalizeRiskScore(value: number | null, label: string | null): number {
  if (value == null || !Number.isFinite(value)) return labelScore(label)
  const normalized = value > 0 && value <= 1 ? value * 100 : value
  return Math.max(0, Math.min(100, normalized))
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function isHighOrCritical(label: string | null): boolean {
  return label === 'Critical' || label === 'High'
}

function toZhLabel(label: string | null): string {
  return (label != null && RISK_LABEL_ZH[label]) ? RISK_LABEL_ZH[label] : (label ?? '未知')
}

// An item is "scored" if it has a valid risk score (>0) or a recognised label.
function isScoredItem(item: NewsSignalInput): boolean {
  const hasValidScore = (
    item.ai_risk_score != null &&
    Number.isFinite(item.ai_risk_score) &&
    item.ai_risk_score > 0
  )
  const hasValidLabel = (
    item.ai_risk_label === 'Low'  || item.ai_risk_label === 'Medium' ||
    item.ai_risk_label === 'High' || item.ai_risk_label === 'Critical'
  )
  return hasValidScore || hasValidLabel
}

// ── sub-scorers ───────────────────────────────────────────────────────────────

function scoreNews(items: NewsSignalInput[]): {
  score: number
  factors: CautionFactor[]
  rawCount: number
  uniqueCount: number
  scoredCount: number
} {
  const rawCount = items.length

  if (rawCount === 0) {
    return { score: 0, factors: [], rawCount: 0, uniqueCount: 0, scoredCount: 0 }
  }

  // Deduplicate by URL then by normalised headline
  const seenUrls      = new Set<string>()
  const seenHeadlines = new Set<string>()
  const unique: NewsSignalInput[] = []

  for (const item of items) {
    const urlKey      = item.url ?? ''
    const headlineKey = (item.headline ?? '').toLowerCase().trim()

    if (urlKey && seenUrls.has(urlKey)) continue
    if (headlineKey && seenHeadlines.has(headlineKey)) continue
    if (urlKey) seenUrls.add(urlKey)
    if (headlineKey) seenHeadlines.add(headlineKey)
    unique.push(item)
  }

  const uniqueCount = unique.length
  const scored      = unique.filter(isScoredItem)
  const scoredCount = scored.length

  if (scoredCount === 0) {
    return { score: 0, factors: [], rawCount, uniqueCount, scoredCount: 0 }
  }

  const scores  = scored.map(item => normalizeRiskScore(item.ai_risk_score, item.ai_risk_label))
  const score   = Math.min(100, avg(scores))

  const factors: CautionFactor[] = []
  for (const item of scored) {
    if (isHighOrCritical(item.ai_risk_label) && factors.length < 2) {
      factors.push({
        description: item.headline ?? '外部新聞高風險文本訊號',
        source:      'Finnhub 外部新聞文本訊號',
        sourceDate:  item.published_at,
      })
    }
  }

  return { score, factors, rawCount, uniqueCount, scoredCount }
}

function scoreSnapshot(
  fastapiSnapshot: SnapshotInput | null,
  phpSnapshot: SnapshotInput | null,
): { score: number; usingPhpFallback: boolean; factors: CautionFactor[]; date: string | null } {
  const snapshot       = fastapiSnapshot ?? phpSnapshot
  const usingPhpFallback = !fastapiSnapshot && !!phpSnapshot

  if (!snapshot) return { score: 0, usingPhpFallback: false, factors: [], date: null }

  const ls = labelScore(snapshot.ai_risk_label)

  const numericFields = [
    snapshot.social_hype_score,
    snapshot.manipulation_signal_score,
    snapshot.fomo_score,
    snapshot.short_squeeze_pressure,
  ].filter((v): v is number => v != null)

  const numericAvg = numericFields.length > 0 ? avg(numericFields) : ls
  const score      = Math.min(100, Math.round(ls * 0.5 + numericAvg * 0.5))

  const factors: CautionFactor[] = []
  if (isHighOrCritical(snapshot.ai_risk_label)) {
    const desc = usingPhpFallback
      ? `歷史資料庫快照呈現${toZhLabel(snapshot.ai_risk_label)}訊號`
      : `最新市場快照呈現${toZhLabel(snapshot.ai_risk_label)}訊號`
    const src = usingPhpFallback ? '歷史資料庫快照 (PHP fallback)' : '最新市場快照'
    factors.push({ description: desc, source: src, sourceDate: snapshot.snapshot_date })
  }

  return { score, usingPhpFallback, factors, date: snapshot.snapshot_date }
}

function scoreHistory(items: HistoryInput[]): { score: number; factors: CautionFactor[] } {
  if (items.length === 0) return { score: 0, factors: [] }

  const recent = items.slice(-5)

  const heatAvg = avg(recent.map(i => i.market_heat_score))
  const volAvg  = avg(recent.map(i => i.volatility_anomaly_score))
  const fomoAvg = avg(recent.map(i => i.fomo_score))
  const sqAvg   = avg(recent.map(i => i.short_squeeze_pressure))

  const score = Math.min(
    100,
    Math.round(heatAvg * 0.35 + volAvg * 0.35 + fomoAvg * 0.15 + sqAvg * 0.15),
  )

  const factors: CautionFactor[] = []
  for (const item of [...recent].reverse()) {
    if (isHighOrCritical(item.market_risk_label) && factors.length < 1) {
      factors.push({
        description: `近期市場趨勢出現${toZhLabel(item.market_risk_label)}訊號`,
        source:      '近期市場風險趨勢',
        sourceDate:  item.date,
      })
    }
  }

  return { score, factors }
}

// ── main export ───────────────────────────────────────────────────────────────

export function computeInvestorCaution(
  newsItems: NewsSignalInput[],
  fastapiSnapshot: SnapshotInput | null,
  histItems: HistoryInput[],
  phpSnapshot: SnapshotInput | null,
  options: CautionOptions = {},
): InvestorCautionResult {
  const newsR = scoreNews(newsItems)
  const snapR = scoreSnapshot(fastapiSnapshot, phpSnapshot)
  const histR = scoreHistory(histItems)

  // hasNews uses scoredCount to exclude items with no valid model output
  const hasNews     = newsR.scoredCount > 0
  const hasSnapshot = !!(fastapiSnapshot ?? phpSnapshot)
  const hasHistory  = histItems.length > 0
  const sourceCount = [hasNews, hasSnapshot, hasHistory].filter(Boolean).length

  let dataCoverage: DataCoverageLevel
  if (sourceCount === 3)      dataCoverage = 'FULL'
  else if (sourceCount === 2) dataCoverage = 'PARTIAL'
  else if (sourceCount === 1) dataCoverage = 'MINIMAL'
  else                        dataCoverage = 'NONE'

  const hasAnyError = !!(
    options.externalNewsError || options.latestSnapshotError || options.marketHistoryError
  )

  let interpretationStatus: InterpretationStatus
  if (dataCoverage === 'FULL' && !hasAnyError) interpretationStatus = 'comprehensive'
  else if (dataCoverage === 'NONE')            interpretationStatus = 'insufficient_data'
  else                                          interpretationStatus = 'preliminary'

  const newsCoverage = {
    rawCount:    newsR.rawCount,
    uniqueCount: newsR.uniqueCount,
    scoredCount: newsR.scoredCount,
  }

  if (dataCoverage === 'NONE') {
    return {
      signalLevel:          'insufficient_data',
      score:                0,
      scoreBreakdown:       { externalNews: 0, latestMarketSnapshot: 0, marketHistory: 0 },
      dataCoverage:         'NONE',
      interpretationStatus: 'insufficient_data',
      coverageNote:         '資料不足，無法產生警戒摘要。',
      keyFactors:           [],
      newsCoverage,
      generatedAt:          new Date().toISOString(),
    }
  }

  // Normalize weights by available sources
  let wNews = hasNews     ? 0.30 : 0
  let wSnap = hasSnapshot ? 0.35 : 0
  let wHist = hasHistory  ? 0.35 : 0
  const totalW = wNews + wSnap + wHist
  wNews /= totalW; wSnap /= totalW; wHist /= totalW

  const combinedScore = Math.round(
    newsR.score * wNews +
    snapR.score * wSnap +
    histR.score * wHist,
  )

  let signalLevel: SignalLevel
  if (combinedScore >= 80)      signalLevel = 'extreme'
  else if (combinedScore >= 60) signalLevel = 'high'
  else if (combinedScore >= 35) signalLevel = 'medium'
  else                          signalLevel = 'low'

  const keyFactors = [...newsR.factors, ...snapR.factors, ...histR.factors].slice(0, 3)

  // Build coverage note
  const noteParts: string[] = []

  // 1. PHP fallback already explains snapshot unavailability; no duplicate note needed.
  if (snapR.usingPhpFallback) {
    noteParts.push('最新市場快照無法取得，目前使用歷史資料庫快照作為參考。')
  }

  // 2. Snapshot error without a PHP fallback rescue
  if (options.latestSnapshotError && !snapR.usingPhpFallback && (hasNews || hasHistory)) {
    noteParts.push('最新市場快照目前取得失敗；本摘要僅能視為初步觀察。')
  }

  // 3. External news coverage (mutually exclusive branches)
  if (options.externalNewsError && (hasSnapshot || hasHistory)) {
    noteParts.push('外部新聞資料目前取得失敗；本摘要主要依市場訊號形成，僅能視為初步觀察。')
  } else if (!hasNews && !options.externalNewsError && (hasSnapshot || hasHistory)) {
    const isHigh = signalLevel === 'high' || signalLevel === 'extreme'
    const marketSourceText =
      hasSnapshot && hasHistory
        ? '最新市場快照與近期市場趨勢'
        : hasSnapshot
          ? '最新市場快照'
          : '近期市場趨勢'
    noteParts.push(
      `目前${isHigh ? '高' : ''}警戒主要來自${marketSourceText}；外部新聞無可分析資料，僅能視為初步觀察。`
    )
  } else if (
    hasNews && !hasHistory && !hasSnapshot &&
    !options.marketHistoryError && !options.latestSnapshotError
  ) {
    noteParts.push('目前訊號主要來自外部新聞；市場資料不足，僅能視為初步觀察。')
  }

  // 4. Market history error
  if (options.marketHistoryError && (hasNews || hasSnapshot)) {
    noteParts.push('近期市場趨勢目前取得失敗；本摘要僅能視為初步觀察。')
  }

  if (noteParts.length === 0 && (dataCoverage === 'PARTIAL' || dataCoverage === 'MINIMAL')) {
    noteParts.push('部分資料來源無法取得，摘要為初步觀察。')
  }

  return {
    signalLevel,
    score: combinedScore,
    scoreBreakdown: {
      externalNews:         Math.round(newsR.score),
      latestMarketSnapshot: Math.round(snapR.score),
      marketHistory:        Math.round(histR.score),
    },
    dataCoverage,
    interpretationStatus,
    coverageNote:  noteParts.join(' '),
    keyFactors,
    newsCoverage,
    generatedAt:   new Date().toISOString(),
  }
}
