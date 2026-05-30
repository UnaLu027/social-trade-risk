import {
  createContext, useContext, useState, useEffect, useCallback,
} from 'react'
import type { ReactNode } from 'react'
import { personalApi } from '../api/personalApiClient'

export interface UserProfile {
  id: number
  email: string
  is_active: boolean
  created_at: string
}

interface AuthContextType {
  user: UserProfile | null
  token: string | null
  isAuthenticated: boolean
  authLoading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

const TOKEN_KEY = 'auth_token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]           = useState<UserProfile | null>(null)
  const [token, setToken]         = useState<string | null>(null)
  const [authLoading, setLoading] = useState(true)

  // On mount: validate any stored token via /auth/me
  useEffect(() => {
    const stored = sessionStorage.getItem(TOKEN_KEY)
    if (!stored) { setLoading(false); return }
    personalApi
      .get<UserProfile>('/api/v1/auth/me', {
        headers: { Authorization: `Bearer ${stored}` },
      })
      .then((res) => { setToken(stored); setUser(res.data) })
      .catch(() => { sessionStorage.removeItem(TOKEN_KEY) })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await personalApi.post<{ access_token: string; user: UserProfile }>(
      '/api/v1/auth/login',
      { email, password },
    )
    const { access_token, user: profile } = res.data
    sessionStorage.setItem(TOKEN_KEY, access_token)
    setToken(access_token)
    setUser(profile)
  }, [])

  const register = useCallback(async (email: string, password: string) => {
    await personalApi.post('/api/v1/auth/register', { email, password })
  }, [])

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!user, authLoading, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
