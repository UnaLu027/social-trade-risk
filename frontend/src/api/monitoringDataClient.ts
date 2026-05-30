/**
 * Fetches the pre-generated monitoring JSON committed by GitHub Actions.
 *
 * URL priority:
 *   1. VITE_MONITORING_DATA_URL env var (set per-environment in .env.local or CI)
 *   2. Public GitHub raw URL for the main branch (production default)
 *
 * Uses cache: 'no-store' so the browser always fetches the latest file after
 * each 6-hour scheduled workflow run.
 *
 * Returns null on network error or non-OK response so callers can display
 * a graceful "no data yet" state without crashing.
 */

const DEFAULT_URL =
  'https://raw.githubusercontent.com/UnaLu027/social-trade-risk/main/generated-data/monitoring-latest.json'

export const MONITORING_DATA_URL: string =
  (import.meta.env.VITE_MONITORING_DATA_URL as string | undefined)?.trim() || DEFAULT_URL

export async function fetchMonitoringData<T>(): Promise<T | null> {
  try {
    const res = await fetch(MONITORING_DATA_URL, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}
