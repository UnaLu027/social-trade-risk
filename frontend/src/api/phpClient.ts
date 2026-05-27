/**
 * PHP + SQL Server API client.
 * Uses VITE_PHP_API_BASE_URL (set in .env.local for development).
 * Falls back to a relative path that works when running under Apache.
 */
import axios from 'axios'

export const PHP_BASE_URL: string =
  import.meta.env.VITE_PHP_API_BASE_URL?.trim() ||
  'http://localhost/social_trading_risk_starter/php-api'

export const phpApi = axios.create({
  baseURL: PHP_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

phpApi.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err?.config?.url ?? ''
    const status = err?.response?.status ?? 'network error'
    console.warn(`[PHP API] ${status} → ${PHP_BASE_URL}${url}`)
    return Promise.reject(err)
  }
)

// ── helper: unwrap { success, data } envelope ──────────────────────────────
export async function phpGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await phpApi.get<{ success: boolean; data: T; error?: string }>(path, { params })
  if (!res.data.success) throw new Error(res.data.error ?? 'PHP API error')
  return res.data.data
}

export async function phpPost<T>(path: string, body: unknown): Promise<T> {
  const res = await phpApi.post<{ success: boolean; data: T; error?: string }>(path, body)
  if (!res.data.success) throw new Error(res.data.error ?? 'PHP API error')
  return res.data.data
}
