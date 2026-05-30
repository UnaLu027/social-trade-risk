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
 *   deduplicateNewsItems(items)         → items deduplicated by URL and normalized headline,
 *                                         preserving first-seen order
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
    // 1. All-uppercase stock ticker — case-SENSITIVE, no false positives.
    { pattern: /\bMETA\b/,                label: 'META' },
    // 2. Full company name — case-insensitive, always unambiguous.
    { pattern: /\bMeta\s+Platforms\b/i,    label: 'Meta Platforms' },
    // 3. Company brand "Meta" — case-SENSITIVE (capital M only) so that lowercase
    //    generic "meta" (as in meta-analysis, meta strategy, metadata) is never
    //    matched.  A negative lookahead further excludes capitalised forms that
    //    open a sentence but refer to a methodology, e.g. "Meta analysis of…" or
    //    "Meta-analysis of…".  The lookahead checks for an optional whitespace/
    //    hyphen separator followed by a known generic meta-prefix word stem.
    { pattern: /\bMeta\b(?![\s-]*(?:analy|data|strateg|framework|model|research|stud(?:y|ie)|review|tag|description))/,
      label: 'Meta' },
    // 4. Ecosystem brands — case-insensitive, unambiguous company references.
    { pattern: /\bFacebook\b/i,            label: 'Facebook' },
    { pattern: /\bInstagram\b/i,           label: 'Instagram' },
    { pattern: /\bWhatsApp\b/i,            label: 'WhatsApp' },
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
 * Evaluate AMC relevance with article-wide AMC Networks exclusion.
 *
 * Priority (evaluated in this order, article-wide not per-field):
 *   1. "AMC Entertainment" in headline or summary → relevant.
 *   2. "AMC Networks" anywhere in article → excluded_other_company.
 *      This prevents bare "AMC" in one field from overriding "AMC Networks"
 *      in another field (e.g. Networks headline + bare AMC summary → excluded).
 *   3. Bare "AMC" in headline or summary → relevant.
 *   4. No AMC reference → no_issuer_match.
 *
 * @param {string} headline
 * @param {string} summary
 * @returns {{ is_relevant: boolean, relevance_basis: string, matched_terms: string[] }}
 */
function _matchAmc(headline, summary) {
  const hl   = headline ?? ''
  const summ = summary  ?? ''

  // Step 1: "AMC Entertainment" is an unambiguous positive match.
  // Check headline first to prefer issuer_term_in_headline basis.
  if (_RE_AMC_ENTERTAINMENT.test(hl)) {
    return { is_relevant: true, relevance_basis: 'issuer_term_in_headline', matched_terms: ['AMC Entertainment'] }
  }
  if (_RE_AMC_ENTERTAINMENT.test(summ)) {
    return { is_relevant: true, relevance_basis: 'issuer_term_in_summary', matched_terms: ['AMC Entertainment'] }
  }

  // Step 2: Article-wide "AMC Networks" exclusion.
  // If "AMC Networks" appears anywhere in the article, the article is about
  // the cable network regardless of bare "AMC" use elsewhere.
  _RE_AMC_NETWORKS.lastIndex = 0
  if (_RE_AMC_NETWORKS.test(hl + ' ' + summ)) {
    return { is_relevant: false, relevance_basis: 'excluded_other_company', matched_terms: [] }
  }

  // Step 3: Bare "AMC" in headline or summary (no Networks context present).
  if (_RE_AMC_BARE.test(hl)) {
    return { is_relevant: true, relevance_basis: 'issuer_term_in_headline', matched_terms: ['AMC'] }
  }
  if (_RE_AMC_BARE.test(summ)) {
    return { is_relevant: true, relevance_basis: 'issuer_term_in_summary', matched_terms: ['AMC'] }
  }

  // Step 4: No AMC reference at all.
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

/**
 * Deduplicate news items by URL and normalized headline, preserving first-seen order.
 *
 * Deduplication rules (same as scoreNews internal logic, extracted for reuse):
 *   - A non-empty URL seen before → skip.
 *   - A normalized headline (lowercase + trimmed) seen before → skip.
 *   - Empty URL/headline fields do not trigger URL/headline deduplication respectively.
 *
 * Call this after filterRelevantNews() so the published list never contains
 * duplicate articles even when the HF candidate pool includes repeats.
 *
 * @param {object[]} items - news items (may include relevance metadata)
 * @returns {object[]} - deduplicated items in original order
 */
export function deduplicateNewsItems(items) {
  const seenUrls      = new Set()
  const seenHeadlines = new Set()
  const unique        = []
  for (const item of items) {
    const urlKey      = item.url ?? ''
    const headlineKey = (item.headline ?? '').toLowerCase().trim()
    if (urlKey && seenUrls.has(urlKey))           continue
    if (headlineKey && seenHeadlines.has(headlineKey)) continue
    if (urlKey)      seenUrls.add(urlKey)
    if (headlineKey) seenHeadlines.add(headlineKey)
    unique.push(item)
  }
  return unique
}
