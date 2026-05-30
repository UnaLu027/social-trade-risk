import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { TrendingUp, LogIn } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

type ApiErr = { response?: { data?: { detail?: string } } }

export function Login() {
  const { login }  = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const successMsg = (location.state as { success?: string } | null)?.success

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email.trim(), password)
      navigate('/risk-monitor', { replace: true })
    } catch (err) {
      const detail = (err as ApiErr)?.response?.data?.detail ?? ''
      if (detail === 'Incorrect email or password') {
        setError('電子郵件或密碼錯誤，請再試一次。')
      } else {
        setError('登入失敗，請稍後再試。')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen p-6"
      style={{ background: '#0f1117' }}
    >
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div
            className="w-8 h-8 rounded flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #10b981, #0ea5e9)' }}
          >
            <TrendingUp size={16} color="white" />
          </div>
          <span className="text-sm font-semibold text-white">Social Trading Risk Copilot</span>
        </div>

        <div className="rounded-xl p-6" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <h1 className="text-lg font-semibold text-white mb-1">登入帳號</h1>
          <p className="text-xs mb-5" style={{ color: '#64748b' }}>
            使用個人帳號以存取專屬觀察清單與背景監控
          </p>

          {successMsg && (
            <div
              className="mb-4 px-3 py-2 rounded text-xs"
              style={{ background: '#052e16', border: '1px solid #065f46', color: '#10b981' }}
            >
              {successMsg}
            </div>
          )}

          {error && (
            <div
              className="mb-4 px-3 py-2 rounded text-xs"
              style={{ background: '#450a0a', border: '1px solid #991b1b', color: '#fca5a5' }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>電子郵件</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="your@email.com"
                className="px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: '#0f1117', border: '1px solid #2d3148', color: '#f1f5f9' }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>密碼</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: '#0f1117', border: '1px solid #2d3148', color: '#f1f5f9' }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 py-2 rounded-md text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #10b981, #0ea5e9)', color: 'white' }}
            >
              {loading ? '登入中…' : <><LogIn size={14} />登入</>}
            </button>
          </form>

          <p className="text-xs text-center mt-4" style={{ color: '#64748b' }}>
            還沒有帳號？{' '}
            <Link to="/register" style={{ color: '#10b981' }}>立即註冊</Link>
          </p>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: '#3d4163' }}>
          未登入仍可以訪客身分瀏覽公開資料
        </p>
      </div>
    </div>
  )
}
