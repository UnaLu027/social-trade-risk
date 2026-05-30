import axios from 'axios'

const PERSONAL_BASE =
  import.meta.env.VITE_PERSONAL_API_BASE_URL?.trim() ||
  'https://social-trade-risk-production.up.railway.app'

export const personalApi = axios.create({
  baseURL: PERSONAL_BASE,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach Bearer token from sessionStorage if present
personalApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

personalApi.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err?.config?.url ?? ''
    const status = err?.response?.status ?? 'network error'
    console.error(`[Personal API] ${status} → ${PERSONAL_BASE}${url}`)
    return Promise.reject(err)
  }
)
