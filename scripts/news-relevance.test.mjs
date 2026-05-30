/**
 * news-relevance.test.mjs
 *
 * Regression tests for evaluateNewsRelevance() and filterRelevantNews().
 * Uses Node's built-in test runner (node:test); no external dependencies.
 *
 * Run with:
 *   node --test scripts/news-relevance.test.mjs
 */

import { test } from 'node:test'
import assert   from 'node:assert/strict'
import { evaluateNewsRelevance, filterRelevantNews, deduplicateNewsItems } from './news-relevance.mjs'

// ── Helper ────────────────────────────────────────────────────────────────────

function item(headline, summary = '') {
  return { headline, summary, id: 'test', source: 'finnhub', published_at: '', url: '',
           ai_risk_label: null, ai_risk_score: null, ai_highlighted_terms: [] }
}

// ── Mandatory GME cases ────────────────────────────────────────────────────────

test('GME: GameStop in headline → relevant, issuer_term_in_headline', () => {
  const r = evaluateNewsRelevance(
    item('GameStop Raises eBay Stake in Takeover Fight'),
    'GME'
  )
  assert.strictEqual(r.is_relevant,      true)
  assert.strictEqual(r.relevance_basis,  'issuer_term_in_headline')
  assert.ok(r.matched_terms.includes('GameStop'), `expected matched_terms to include 'GameStop', got ${JSON.stringify(r.matched_terms)}`)
})

test('GME: Etsy/eBay article with no GameStop/GME in headline or summary → not relevant', () => {
  const r = evaluateNewsRelevance(
    item(
      'Etsy and eBay Amend Depop Sale Agreement, Extending Timeline To Q3 2026',
      'On May 21, 2026, Etsy, Inc., a Delaware corporation entered into an amendment with eBay.'
    ),
    'GME'
  )
  assert.strictEqual(r.is_relevant,     false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
  assert.deepStrictEqual(r.matched_terms, [])
})

// ── Mandatory NVDA case ────────────────────────────────────────────────────────

test('NVDA: Solana article with no Nvidia/NVDA in headline or summary → not relevant', () => {
  const r = evaluateNewsRelevance(
    item(
      'Can Solana (SOL) Reclaim Its $294 All-Time High?',
      'A lot of investments that lose 70% never recover, but Solana may be different.'
    ),
    'NVDA'
  )
  assert.strictEqual(r.is_relevant,     false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
})

// ── Mandatory MSFT case ────────────────────────────────────────────────────────

test('MSFT: MercadoLibre article with no Microsoft/MSFT in headline or summary → not relevant', () => {
  const r = evaluateNewsRelevance(
    item(
      'NWI Management Dumps 42,700 MercadoLibre Shares Worth $82.4 Million',
      'The fund reduced its position in MercadoLibre following Q1 earnings.'
    ),
    'MSFT'
  )
  assert.strictEqual(r.is_relevant,     false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
})

// ── Mandatory AMZN case ────────────────────────────────────────────────────────

test('AMZN: Erewhon article with no Amazon/AMZN/AWS in headline or summary → not relevant', () => {
  const r = evaluateNewsRelevance(
    item(
      'Erewhon sued in Culver City over a rent dispute',
      'Trendy grocery chain Erewhon has fallen behind on its lease payments.'
    ),
    'AMZN'
  )
  assert.strictEqual(r.is_relevant,     false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
})

// ── Mandatory AMC exclusion cases ────────────────────────────────────────────

test('AMC: "AMC Networks Reports Quarterly Results" with no AMC Entertainment → excluded_other_company', () => {
  const r = evaluateNewsRelevance(
    item('AMC Networks Reports Quarterly Results', 'AMC Networks had a strong quarter.'),
    'AMC'
  )
  assert.strictEqual(r.is_relevant,     false)
  assert.strictEqual(r.relevance_basis, 'excluded_other_company')
})

test('AMC: "AMC Entertainment Shares Rise After Box Office Update" → relevant', () => {
  const r = evaluateNewsRelevance(
    item('AMC Entertainment Shares Rise After Box Office Update'),
    'AMC'
  )
  assert.strictEqual(r.is_relevant,     true)
  assert.strictEqual(r.relevance_basis, 'issuer_term_in_headline')
  assert.ok(r.matched_terms.includes('AMC Entertainment'))
})

// ── Summary-only match ────────────────────────────────────────────────────────

test('NVDA: match only in summary → relevant, issuer_term_in_summary', () => {
  const r = evaluateNewsRelevance(
    item(
      'Semiconductor Sector Outlook for Q3 2026',
      'Analysts expect NVIDIA to continue leading the AI chip market through 2026.'
    ),
    'NVDA'
  )
  assert.strictEqual(r.is_relevant,     true)
  assert.strictEqual(r.relevance_basis, 'issuer_term_in_summary')
  assert.ok(r.matched_terms.includes('NVIDIA'))
})

test('AMZN: "AWS" only in summary → relevant, issuer_term_in_summary', () => {
  const r = evaluateNewsRelevance(
    item(
      'Cloud Computing Growth Accelerates in 2026',
      'AWS posted 40% year-over-year revenue growth in Q1.'
    ),
    'AMZN'
  )
  assert.strictEqual(r.is_relevant,     true)
  assert.strictEqual(r.relevance_basis, 'issuer_term_in_summary')
  assert.ok(r.matched_terms.includes('AWS'))
})

// ── Case-insensitive matching ─────────────────────────────────────────────────

test('TSLA: lowercase "tesla" in headline matches case-insensitively', () => {
  const r = evaluateNewsRelevance(
    item('how tesla is disrupting the auto industry'),
    'TSLA'
  )
  assert.strictEqual(r.is_relevant, true)
  assert.ok(r.matched_terms.includes('Tesla'))
})

test('GME: mixed-case "GameSTOP" is not matched (boundary check)', () => {
  // "GameSTOP" is not a word-boundary match for /\bGameStop\b/i
  // because "GameSTOP" as one token does match /\bgamestop\b/i (it's the same word)
  // — verify that "GAMESTOP" (all-caps) also matches
  const r = evaluateNewsRelevance(item('GAMESTOP shares surge'), 'GME')
  assert.strictEqual(r.is_relevant, true)
  assert.ok(r.matched_terms.includes('GameStop'))
})

// ── Punctuation boundary handling ────────────────────────────────────────────

test('GME: "GME" inside parentheses and comma list → relevant', () => {
  const r = evaluateNewsRelevance(
    item('Why HPE, NOW, SMCI, ASTS, GME Are In Focus Today'),
    'GME'
  )
  assert.strictEqual(r.is_relevant, true)
  assert.ok(r.matched_terms.includes('GME'))
})

test('GME: "(GME)" with surrounding parentheses → relevant', () => {
  const r = evaluateNewsRelevance(item('(GME) sees heavy retail volume'), 'GME')
  assert.strictEqual(r.is_relevant, true)
})

test('AAPL: "Apple" after colon → relevant', () => {
  const r = evaluateNewsRelevance(item('Market Report: Apple gains 2% on strong iPhone demand'), 'AAPL')
  assert.strictEqual(r.is_relevant, true)
  assert.ok(r.matched_terms.includes('Apple'))
})

// ── AMC edge cases ────────────────────────────────────────────────────────────

test('AMC: headline mentions only "AMC" (not Networks or Entertainment) → relevant', () => {
  const r = evaluateNewsRelevance(item('AMC Box Office Breaks Records This Weekend'), 'AMC')
  assert.strictEqual(r.is_relevant, true)
  assert.ok(r.matched_terms.includes('AMC'))
})

test('AMC: article with both AMC Networks and AMC Entertainment → relevant', () => {
  const r = evaluateNewsRelevance(
    item('AMC Networks and AMC Entertainment report diverging quarterly results'),
    'AMC'
  )
  assert.strictEqual(r.is_relevant, true)
  assert.ok(r.matched_terms.includes('AMC Entertainment'))
})

test('AMC: article with no AMC reference at all → no_issuer_match', () => {
  const r = evaluateNewsRelevance(item('Box office revenue declined 5% this quarter'), 'AMC')
  assert.strictEqual(r.is_relevant,     false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
})

// ── filterRelevantNews ────────────────────────────────────────────────────────

test('filterRelevantNews: returns only relevant items with metadata merged', () => {
  const items = [
    item('GameStop Raises eBay Stake in Takeover Fight'),           // relevant
    item('Etsy and eBay Amend Depop Sale Agreement'),              // not relevant
    item('GME short interest hits all-time high'),                  // relevant
    item('Nasdaq futures rise on earnings optimism'),               // not relevant
  ]
  const result = filterRelevantNews(items, 'GME')
  assert.strictEqual(result.length, 2)
  for (const r of result) {
    assert.strictEqual(r.is_relevant, true)
    assert.ok(typeof r.relevance_basis === 'string')
    assert.ok(Array.isArray(r.matched_terms))
    assert.ok(r.matched_terms.length > 0)
  }
})

test('filterRelevantNews: zero relevant items returns empty array without error', () => {
  const items = [
    item('Etsy reports strong Q2 earnings'),
    item('Cryptocurrency market update'),
  ]
  const result = filterRelevantNews(items, 'GME')
  assert.strictEqual(result.length, 0)
  assert.ok(Array.isArray(result))
})

test('filterRelevantNews: empty input returns empty array', () => {
  const result = filterRelevantNews([], 'TSLA')
  assert.deepStrictEqual(result, [])
})

// ── MSFT ticker match ─────────────────────────────────────────────────────────

test('MSFT: "Microsoft" in headline → relevant', () => {
  const r = evaluateNewsRelevance(
    item('Microsoft AI Run Rate Highlights Cloud Growth'),
    'MSFT'
  )
  assert.strictEqual(r.is_relevant, true)
  assert.ok(r.matched_terms.includes('Microsoft'))
})

// ── META cases ────────────────────────────────────────────────────────────────

test('META: "Facebook" in headline → relevant', () => {
  const r = evaluateNewsRelevance(item('Facebook parent Meta reports ad revenue surge'), 'META')
  assert.strictEqual(r.is_relevant, true)
  assert.ok(r.matched_terms.includes('Facebook'))
})

test('META: "Vistra (VST)" article with no Meta/META/Facebook/Instagram/WhatsApp → not relevant', () => {
  const r = evaluateNewsRelevance(
    item('Is Vistra (VST) The Best AI Energy Stock to Buy Now?',
         'Vistra offers an interesting play on AI power demand.'),
    'META'
  )
  assert.strictEqual(r.is_relevant, false)
})

// ── Unknown symbol ────────────────────────────────────────────────────────────

test('Unknown symbol returns no_issuer_match without throwing', () => {
  const r = evaluateNewsRelevance(item('Some headline'), 'UNKNOWN')
  assert.strictEqual(r.is_relevant,     false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
  assert.deepStrictEqual(r.matched_terms, [])
})

// ── deduplicateNewsItems ──────────────────────────────────────────────────────

// Helper for dedup tests: constructs a relevant-tagged item with a specific URL
function taggedItem(headline, url, summary = '') {
  return {
    headline, url, summary,
    id: 'test', source: 'finnhub', published_at: '',
    ai_risk_label: 'Low', ai_risk_score: 15, ai_highlighted_terms: [],
    is_relevant: true, relevance_basis: 'issuer_term_in_headline', matched_terms: ['GME'],
  }
}

test('deduplicateNewsItems: duplicate URL items published only once, first-seen kept', () => {
  const items = [
    taggedItem('GameStop Raises eBay Stake',   'https://example.com/gme-1'),
    taggedItem('GME Short Interest Update',    'https://example.com/gme-2'),
    taggedItem('Duplicate of first by URL',    'https://example.com/gme-1'),  // dup URL
  ]
  const result = deduplicateNewsItems(items)
  assert.strictEqual(result.length, 2)
  assert.strictEqual(result[0].headline, 'GameStop Raises eBay Stake')  // first-seen preserved
  assert.strictEqual(result[1].headline, 'GME Short Interest Update')
})

test('deduplicateNewsItems: duplicate normalized headline items published only once', () => {
  const items = [
    taggedItem('  GameStop Raises eBay Stake  ', 'https://example.com/a'),
    taggedItem('GAMESTOP RAISES EBAY STAKE',     'https://example.com/b'),  // same headline, case+trim
  ]
  const result = deduplicateNewsItems(items)
  assert.strictEqual(result.length, 1)
  // First-seen (trimmed original) is preserved
  assert.strictEqual(result[0].url, 'https://example.com/a')
})

test('deduplicateNewsItems: first-seen order is preserved for all unique items', () => {
  const items = [
    taggedItem('First GME article',  'https://example.com/1'),
    taggedItem('Second GME article', 'https://example.com/2'),
    taggedItem('Third GME article',  'https://example.com/3'),
  ]
  const result = deduplicateNewsItems(items)
  assert.strictEqual(result.length, 3)
  assert.strictEqual(result[0].headline, 'First GME article')
  assert.strictEqual(result[1].headline, 'Second GME article')
  assert.strictEqual(result[2].headline, 'Third GME article')
})

// ── META precision — reject generic "meta" contexts ───────────────────────────

test('META: "META Shares Rise After Earnings" → relevant', () => {
  const r = evaluateNewsRelevance(item('META Shares Rise After Earnings'), 'META')
  assert.strictEqual(r.is_relevant, true)
  assert.ok(r.matched_terms.includes('META'))
})

test('META: "Meta Platforms Announces New AI Product" → relevant', () => {
  const r = evaluateNewsRelevance(item('Meta Platforms Announces New AI Product'), 'META')
  assert.strictEqual(r.is_relevant, true)
  assert.ok(r.matched_terms.includes('Meta Platforms'))
})

test('META: "A meta-analysis of AI investment trends" → not relevant', () => {
  const r = evaluateNewsRelevance(
    item('A meta-analysis of AI investment trends',
         'Researchers reviewed 50 AI investment studies.'),
    'META'
  )
  assert.strictEqual(r.is_relevant, false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
})

test('META: "New metadata framework improves research" → not relevant', () => {
  const r = evaluateNewsRelevance(
    item('New metadata framework improves research reproducibility',
         'Scientists propose a metadata standard for datasets.'),
    'META'
  )
  assert.strictEqual(r.is_relevant, false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
})

test('META: "A meta analysis of AI investment trends" (spaced, no hyphen) → not relevant', () => {
  const r = evaluateNewsRelevance(
    item('A meta analysis of AI investment trends',
         'Researchers surveyed 30 AI investment papers.'),
    'META'
  )
  assert.strictEqual(r.is_relevant, false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
})

test('META: "Meta analysis of AI investment trends" (sentence-start capital) → not relevant', () => {
  const r = evaluateNewsRelevance(
    item('Meta analysis of AI investment trends reveals mixed results'),
    'META'
  )
  assert.strictEqual(r.is_relevant, false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
})

test('META: "meta strategy framework for researchers" (lowercase) → not relevant', () => {
  const r = evaluateNewsRelevance(
    item('meta strategy framework for researchers in 2026'),
    'META'
  )
  assert.strictEqual(r.is_relevant, false)
  assert.strictEqual(r.relevance_basis, 'no_issuer_match')
})

test('META: "Meta launches a metadata tool for advertisers" → relevant (company Meta, not metadata)', () => {
  const r = evaluateNewsRelevance(
    item('Meta launches a metadata tool for advertisers',
         'Meta Platforms unveiled a new ad-targeting toolkit.'),
    'META'
  )
  assert.strictEqual(r.is_relevant, true)
  // "Meta" in the headline refers to the company; "metadata" is a separate word
  // and does not trigger a match (no word boundary inside "metadata")
})

// ── AMC Networks article-wide exclusion across headline + summary ─────────────

test('AMC: Networks in headline, bare AMC in summary → excluded_other_company', () => {
  const r = evaluateNewsRelevance(
    item(
      'AMC Networks Reports Quarterly Results',
      'AMC reported revenue growth of 8% this quarter, beating expectations.'
    ),
    'AMC'
  )
  assert.strictEqual(r.is_relevant,     false)
  assert.strictEqual(r.relevance_basis, 'excluded_other_company')
})

test('AMC: "AMC Entertainment Shares Rise" headline → still relevant (takes priority)', () => {
  const r = evaluateNewsRelevance(
    item('AMC Entertainment Shares Rise', 'AMC Networks also had a strong week.'),
    'AMC'
  )
  assert.strictEqual(r.is_relevant,    true)
  assert.strictEqual(r.relevance_basis, 'issuer_term_in_headline')
  assert.ok(r.matched_terms.includes('AMC Entertainment'))
})

test('AMC: "AMC Shares Rise After Box Office Weekend" with no Networks → relevant', () => {
  const r = evaluateNewsRelevance(
    item('AMC Shares Rise After Box Office Weekend', 'Attendance hit a 2026 high.'),
    'AMC'
  )
  assert.strictEqual(r.is_relevant,    true)
  assert.strictEqual(r.relevance_basis, 'issuer_term_in_headline')
  assert.ok(r.matched_terms.includes('AMC'))
})
