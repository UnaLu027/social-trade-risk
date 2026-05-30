// Rule-based news relevance scoring
// Determines how closely a news item relates to the queried symbol.
// No ML model — fully transparent keyword matching on headline + summary.

export type NewsRelevanceLevel = 'direct' | 'contextual' | 'low'

interface CompanyKeywords {
  direct: string[]
  contextual: string[]
}

// Keywords are matched case-insensitively as substrings.
// Financial news context (Finnhub) makes false positives rare for these terms.
const COMPANY_KEYWORDS: Record<string, CompanyKeywords> = {
  GME: {
    direct:     ['gamestop', 'gme'],
    contextual: ['meme stock', 'short squeeze', 'wallstreetbets', 'wsb'],
  },
  TSLA: {
    direct:     ['tesla', 'tsla', 'cybercab', 'robotaxi'],
    contextual: ['electric vehicle', 'elon musk', 'autonomous vehicle', 'ev maker'],
  },
  AAPL: {
    direct:     ['apple', 'aapl', 'iphone', 'ipad', 'airpods'],
    contextual: ['smartphone', 'app store', 'ios ', 'macos'],
  },
  AMC: {
    direct:     ['amc entertainment', 'amc'],
    contextual: ['movie theater', 'cinema', 'box office', 'meme stock'],
  },
  NVDA: {
    direct:     ['nvidia', 'nvda'],
    contextual: ['gpu', 'graphics card', 'ai chip', 'semiconductor', 'cuda'],
  },
  MSFT: {
    direct:     ['microsoft', 'msft'],
    contextual: ['azure', 'office 365', 'windows os', 'copilot'],
  },
  META: {
    direct:     ['meta platforms', 'facebook', 'instagram', 'whatsapp', 'meta '],
    contextual: ['social media', 'social network', 'metaverse'],
  },
  AMZN: {
    direct:     ['amazon', 'amzn', 'aws'],
    contextual: ['e-commerce', 'cloud computing', 'prime video'],
  },
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some(t => text.includes(t))
}

/**
 * Returns the relevance level of a news item for the given symbol.
 * - direct:     headline/summary explicitly mentions the company or ticker
 * - contextual: mentions the sector/industry but not the company directly
 * - low:        no recognisable connection to the symbol
 *
 * For unknown symbols (not in COMPANY_KEYWORDS), returns 'direct' so all
 * existing items pass through at full weight — backward compatible.
 */
export function getNewsRelevance(
  symbol: string,
  headline: string | null | undefined,
  summary?: string | null,
): NewsRelevanceLevel {
  const kw = COMPANY_KEYWORDS[symbol.toUpperCase()]
  if (!kw) return 'direct'

  const text = [headline, summary].filter(Boolean).join(' ').toLowerCase()
  if (!text) return 'low'

  if (containsAny(text, kw.direct))     return 'direct'
  if (containsAny(text, kw.contextual)) return 'contextual'
  return 'low'
}

export const RELEVANCE_LABEL: Record<NewsRelevanceLevel, string> = {
  direct:     '直接相關',
  contextual: '間接相關',
  low:        '低相關',
}

export const RELEVANCE_COLOR: Record<NewsRelevanceLevel, string> = {
  direct:     '#10b981',
  contextual: '#38bdf8',
  low:        '#64748b',
}
