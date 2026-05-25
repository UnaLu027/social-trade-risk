/**
 * Normalise a raw ticker input typed by the user.
 *
 * Rules:
 * - Trim + uppercase.
 * - Pure 4-digit number → Taiwan stock, auto-append '.TW'.
 *   e.g. '2330' → '2330.TW'
 * - Anything else returned as-is (US tickers, already-normalised codes).
 */
export function normalizeTicker(input: string): string {
  const value = input.trim().toUpperCase()
  if (/^\d{4}$/.test(value)) return `${value}.TW`
  return value
}
