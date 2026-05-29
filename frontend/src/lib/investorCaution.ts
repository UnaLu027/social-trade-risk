// Rule-based investor caution summary
// Data source: Finnhub external news text signals + FastAPI market data
// NOT social forum/Reddit signals

export type SignalLevel = 'low' | 'medium' | 'high' | 'extreme' | 'insufficient_data'
export type DataCoverageLevel = 'FULL' | 'PARTIAL' | 'MINIMAL' | 'NONE'
export type InterpretationStatus = 'comprehensive' | 'preliminary' | 'insufficient_data'

export interface CautionFactor {
  description: string
  source: string
  sourceDate?: string
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
  generatedAt: string
}

// Input shape contracts (structural, compatible with RiskReport local types)
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

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function isHighOrCritical(label: string | null): boolean {
  return label === 'Critical' || label === 'High'
}

// ── sub-scorers ───────────────────────────────────────────────────────────────

function scoreNews(items: NewsSignalInput[]): { score: number; factors: CautionFactor[] } {
  if (items.length === 0) return { score: 0, factors: [] }

  // Deduplicate by URL then by headline
  const seenUrls = new Set<string>()
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

  const scores = unique.map(item =>
    item.ai_risk_score != null ? item.ai_risk_score : labelScore(item.ai_risk_label)
  )

  const score = Math.min(100, avg(scores))

  const factors: CautionFactor[] = []
  for (const item of unique) {
    if (isHighOrCritical(item.ai_risk_label) && factors.length < 2) {
      factors.push({
        description: item.headline ?? '外部新聞高風險文本訊號',
        source:      'Finnhub 外部新聞文本訊號',
        sourceDate:  item.published_at,
      })
    }
  }

  return { score, factors }
}

function scoreSnapshot(
  fastapiSnapshot: SnapshotInput | null,
  phpSnapshot: SnapshotInput | null,
): { score: number; usingPhpFallback: boolean; factors: CautionFactor[]; date: string | null } {
  const snapshot = fastapiSnapshot ?? phpSnapshot
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
  const score = Math.min(100, Math.round(ls * 0.5 + numericAvg * 0.5))

  const factors: CautionFactor[] = []
  if (isHighOrCritical(snapshot.ai_risk_label)) {
    const src = usingPhpFallback ? '歷史資料庫快照 (PHP fallback)' : '最新市場快照'
    factors.push({
      description: `市場快照顯示 ${snapshot.ai_risk_label} 風險等級`,
      source:      src,
      sourceDate:  snapshot.snapshot_date,
    })
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
        description: `近期市場出現 ${item.market_risk_label} 風險等級`,
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
): InvestorCautionResult {
  const newsR     = scoreNews(newsItems)
  const snapR     = scoreSnapshot(fastapiSnapshot, phpSnapshot)
  const histR     = scoreHistory(histItems)

  const hasNews     = newsItems.length > 0
  const hasSnapshot = !!(fastapiSnapshot ?? phpSnapshot)
  const hasHistory  = histItems.length > 0
  const sourceCount = [hasNews, hasSnapshot, hasHistory].filter(Boolean).length

  let dataCoverage: DataCoverageLevel
  if (sourceCount === 3)      dataCoverage = 'FULL'
  else if (sourceCount === 2) dataCoverage = 'PARTIAL'
  else if (sourceCount === 1) dataCoverage = 'MINIMAL'
  else                        dataCoverage = 'NONE'

  let interpretationStatus: InterpretationStatus
  if (dataCoverage === 'FULL')  interpretationStatus = 'comprehensive'
  else if (dataCoverage === 'NONE') interpretationStatus = 'insufficient_data'
  else                          interpretationStatus = 'preliminary'

  if (dataCoverage === 'NONE') {
    return {
      signalLevel:       'insufficient_data',
      score:             0,
      scoreBreakdown:    { externalNews: 0, latestMarketSnapshot: 0, marketHistory: 0 },
      dataCoverage:      'NONE',
      interpretationStatus: 'insufficient_data',
      coverageNote:      '資料不足，無法產生警戒摘要。',
      keyFactors:        [],
      generatedAt:       new Date().toISOString(),
    }
  }

  // Normalize weights by available sources
  let wNews = hasNews     ? 0.30 : 0
  let wSnap = hasSnapshot ? 0.35 : 0
  let wHist = hasHistory  ? 0.35 : 0
  const totalW = wNews + wSnap + wHist
  wNews /= totalW; wSnap /= totalW; wHist /= totalW

  const combinedScore = Math.round(
    newsR.score  * wNews +
    snapR.score  * wSnap +
    histR.score  * wHist,
  )

  let signalLevel: SignalLevel
  if (combinedScore >= 80)      signalLevel = 'extreme'
  else if (combinedScore >= 60) signalLevel = 'high'
  else if (combinedScore >= 35) signalLevel = 'medium'
  else                          signalLevel = 'low'

  const keyFactors = [...newsR.factors, ...snapR.factors, ...histR.factors].slice(0, 3)

  // Build coverage note
  const noteParts: string[] = []

  if (snapR.usingPhpFallback) {
    noteParts.push('最新市場快照無法取得，目前使用歷史資料庫快照作為參考。')
  }

  if (!hasNews && hasSnapshot) {
    const isHigh = signalLevel === 'high' || signalLevel === 'extreme'
    noteParts.push(
      `目前${isHigh ? '高' : ''}警戒主要來自市場訊號；外部新聞資料不足，僅能視為初步觀察。`,
    )
  } else if (!hasNews && hasHistory && !hasSnapshot) {
    const isHigh = signalLevel === 'high' || signalLevel === 'extreme'
    noteParts.push(
      `目前${isHigh ? '高' : ''}警戒主要來自市場歷史異常訊號；外部新聞資料不足，僅能視為初步觀察。`,
    )
  } else if (hasNews && !hasHistory && !hasSnapshot) {
    noteParts.push('目前訊號主要來自外部新聞；市場資料不足，僅能視為初步觀察。')
  } else if (dataCoverage === 'PARTIAL' || dataCoverage === 'MINIMAL') {
    noteParts.push('部分資料來源無法取得，摘要為初步觀察。')
  }

  const coverageNote = noteParts.join(' ')

  return {
    signalLevel,
    score: combinedScore,
    scoreBreakdown: {
      externalNews:        Math.round(newsR.score),
      latestMarketSnapshot: Math.round(snapR.score),
      marketHistory:       Math.round(histR.score),
    },
    dataCoverage,
    interpretationStatus,
    coverageNote,
    keyFactors,
    generatedAt: new Date().toISOString(),
  }
}
