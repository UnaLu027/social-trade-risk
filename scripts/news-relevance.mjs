/**
 * news-relevance.mjs
 *
 * Symbol relevance gating for Finnhub news items returned by the HF
 * /api/v1/social-signals endpoint.  The endpoint delivers a candidate pool
 * of articles without relevance fields; this module provides precision-first
 * regex-boundary matching to gate which articles are actually about the
 * queried company before scoring or publishing.
 *
 * Exports:
 *   evaluateNewsRelevance(item, symbol) → { is_relevant, relevance_basis, matched_terms }
 *   filterRelevantNews(items, symbol)   → relevant items with relevance metadata merged in
 */

// ── Issuer term registry ────────────────────────────────────────────────────
// Each entry is an array of { pattern, label } objects.
// Patterns use \b word-boundary anchors so 'MSFT' never matches 'MicrosoftSFT'
// and 'Apple' never matches 'Appleton'.
// All patterns are case-insensitive (the /i flag).
// AMC uses special handling (see _matchAmc) and is intentionally absent here.

const ISSUER_PATTERNS = {
  GME: [
    { pattern: /\bGME\b/i,            label: 'GME' },
    { pattern: /\bGameStop\b/i,        label: 'GameStop' },
    { pattern: /\bGame\s+Stop\b/i,     label: 'Game Stop' },
  ],
  TSLA: [
    { pattern: /\bTSLA\b/i,            label: 'TSLA' },
    { pattern: /\bTesla\b/i,           label: 'Tesla' },
  ],
  AAPL: [
    { pattern: /\bAAPL\b/i,            label: 'AAPL' },
    { pattern: /\bApple\b/i,           label: 'Apple' },
  ],
  NVDA: [
    { pattern: /\bNVDA\b/i,            label: 'NVDA' },
    { pattern: /\bNVIDIA\b/i,          label: 'NVIDIA' },
  ],
  MSFT: [
    { pattern: /\bMSFT\b/i,            label: 'MSFT' },
    { pattern: /\bMicrosoft\b/i,       label: 'Microsoft' },
  ],
  META: [
    { pattern: /\bMETA\b/i,            label: 'META' },
    { pattern: /\bMeta\s+Platforms\b/i, label: 'Meta Platforms' },
    { pattern: /\bFacebook\b/i,        label: 'Facebook' },
    { pattern: /\bInstagram\b/i,       label: 'Instagram' },
    { pattern: /\bWhatsApp\b/i,        label: 'WhatsApp' },
  ],
  AMZN: [
    { pattern: /\bAMZN\b/i,                         label: 'AMZN' },
    { pattern: /\bAmazon\b/i,                        label: 'Amazon' },
    { pattern: /\bAmazon\s+Web\s+Services\b/i,       label: 'Amazon Web Services' },
    { pattern: /\bAWS\b/i,                           label: 'AWS' },
  ],
}

// ── AMC special patterns ────────────────────────────────────────────────────
// "AMC Networks" articles must NOT be treated as relevant to AMC Entertainment.
// An article is relevant only when AMC Entertainment is mentioned, or when
// "AMC" appears outside the "AMC Networks" context.

const _RE_AMC_ENTERTAINMENT = /\bAMC\s+Entertainment\b/i
const _RE_AMC_NETWORKS       = /\bAMC\s+Networks?\b/ig   // global for replaceAll
const _RE_AMC_BARE           = /\bAMC\b/i

/**
 * Evaluate AMC relevance with the AMC Networks exclusion rule.
 * @param {string} headline
 * @param {string} summary
 * @returns {{ is_relevant: boolean, relevance_basis: string, matched_terms: string[] }}
 */
function _matchAmc(headline, summary) {
  // Check headline first (strongest signal), then summary
  for (const [text, basis] of [
    [headline, 'issuer_term_in_headline'],
    [summary,  'issuer_term_in_summary'],
  ]) {
    if (!text) continue

    // "AMC Entertainment" is an unambiguous positive match
    if (_RE_AMC_ENTERTAINMENT.test(text)) {
      return { is_relevant: true, relevance_basis: basis, matched_terms: ['AMC Entertainment'] }
    }

    if (_RE_AMC_BARE.test(text)) {
      // Strip every "AMC Networks" occurrence and check if "AMC" still appears.
      // If yes → AMC appears in a non-Networks context → relevant.
      // Reset lastIndex since the regex flag is /g.
      _RE_AMC_NETWORKS.lastIndex = 0
      const stripped = text.replace(_RE_AMC_NETWORKS, '\x00')
      if (_RE_AMC_BARE.test(stripped)) {
        return { is_relevant: true, relevance_basis: basis, matched_terms: ['AMC'] }
      }
      // AMC matched but only inside "AMC Networks" — fall through to next source
    }
  }

  // If we reach here, nothing above qualified as relevant.
  // Determine the correct negative basis.
  const both = headline + ' ' + summary
  _RE_AMC_NETWORKS.lastIndex = 0
  if (_RE_AMC_NETWORKS.test(both)) {
    return { is_relevant: false, relevance_basis: 'excluded_other_company', matched_terms: [] }
  }
  return { is_relevant: false, relevance_basis: 'no_issuer_match', matched_terms: [] }
}

// ── Generic matching helpers ────────────────────────────────────────────────

/**
 * Returns labels of all patterns that match the given text.
 * @param {string} text
 * @param {{ pattern: RegExp, label: string }[]} patterns
 * @returns {string[]}
 */
function _findMatches(text, patterns) {
  return patterns
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label)
}

/**
 * Evaluate a single news item for relevance to a given symbol.
 *
 * @param {{ headline?: string, summary?: string }} item - news item (raw HF payload)
 * @param {string} symbol - one of GME TSLA AAPL AMC NVDA MSFT META AMZN
 * @returns {{
 *   is_relevant: boolean,
 *   relevance_basis: 'issuer_term_in_headline'|'issuer_term_in_summary'|'no_issuer_match'|'excluded_other_company',
 *   matched_terms: string[]
 * }}
 */
export function evaluateNewsRelevance(item, symbol) {
  const headline = item.headline ?? ''
  const summary  = item.summary  ?? ''

  if (symbol === 'AMC') {
    return _matchAmc(headline, summary)
  }

  const patterns = ISSUER_PATTERNS[symbol]
  if (!patterns) {
    // Unknown symbol — refuse to guess; treat as no match
    return { is_relevant: false, relevance_basis: 'no_issuer_match', matched_terms: [] }
  }

  // Headline check (higher signal)
  const headlineMatches = _findMatches(headline, patterns)
  if (headlineMatches.length > 0) {
    return { is_relevant: true, relevance_basis: 'issuer_term_in_headline', matched_terms: headlineMatches }
  }

  // Summary check (accepted but lower confidence)
  const summaryMatches = _findMatches(summary, patterns)
  if (summaryMatches.length > 0) {
    return { is_relevant: true, relevance_basis: 'issuer_term_in_summary', matched_terms: summaryMatches }
  }

  return { is_relevant: false, relevance_basis: 'no_issuer_match', matched_terms: [] }
}

/**
 * Filter a candidate pool of news items to those relevant to a symbol,
 * and merge relevance metadata into each returned item.
 *
 * @param {object[]} items  - raw HF news items (headline + summary available)
 * @param {string}   symbol
 * @returns {object[]} - relevant items with { relevance_basis, matched_terms, is_relevant } merged in
 */
export function filterRelevantNews(items, symbol) {
  return items
    .map(item => {
      const evaluation = evaluateNewsRelevance(item, symbol)
      return { ...item, ...evaluation }
    })
    .filter(item => item.is_relevant)
}
