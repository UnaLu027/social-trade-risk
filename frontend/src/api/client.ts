import axios from 'axios'

// Vite bakes VITE_API_BASE_URL at build time from GitHub Secret.
// Fall back to the production Railway URL so the app works even when the
// secret hasn't been configured in the repo.
const PROD_URL = 'https://social-trade-risk-production.up.railway.app'
export const BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL?.trim() || PROD_URL

if (import.meta.env.DEV) {
  console.info('[API] base URL:', BASE_URL)
}

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err?.config?.url ?? ''
    const status = err?.response?.status ?? 'network error'
    console.error(`[API error] ${status} → ${BASE_URL}${url}`)
    return Promise.reject(err)
  }
)
