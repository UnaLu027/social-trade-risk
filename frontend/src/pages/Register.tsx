import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { TrendingUp, UserPlus, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

type ApiErr = { response?: { status?: number; data?: { detail?: string } } }

export function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8)   { setError('密碼至少需要 8 個字元。'); return }
    if (password.length > 128) { setError('密碼不可超過 128 個字元。'); return }
    if (password !== confirm)  { setError('兩次輸入的密碼不一致。'); return }
    setLoading(true)
    try {
      await register(email.trim(), password)
      navigate('/login', { state: { success: '帳號建立成功！請登入。' } })
    } catch (err) {
      const status = (err as ApiErr)?.response?.status
      const detail = (err as ApiErr)?.response?.data?.detail ?? ''
      if (status === 409) {
        setError('此電子郵件已被使用，請直接登入或使用其他信箱。')
      } else if (detail.includes('8')) {
        setError('密碼至少需要 8 個字元。')
      } else if (detail.includes('128')) {
        setError('密碼不可超過 128 個字元。')
      } else {
        setError('註冊失敗，請稍後再試。')
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

        {/* Account / data disclosure */}
        <div
          className="rounded-xl p-4 mb-4 flex flex-col gap-2"
          style={{ background: '#0d1425', border: '1px solid #1e3a5f' }}
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={13} color="#38bdf8" />
            <span className="text-xs font-semibold" style={{ color: '#38bdf8' }}>帳號建立說明</span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: '#7dd3fc' }}>
            建立帳號後，系統僅保存您的電子郵件、加密後的本站專用密碼，以及個人觀察清單。
            本站不提供實際交易，也不會取得券商、銀行或其他第三方帳戶資料。
            請為本網站建立一組全新的專用密碼，勿重複使用 Google、學校信箱、銀行、券商或其他服務的密碼。
          </p>
          <Link
            to="/security-notice"
            className="text-[11px] underline self-start"
            style={{ color: '#38bdf8' }}
          >
            查看資料使用與安全說明
          </Link>
        </div>

        <div className="rounded-xl p-6" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <h1 className="text-lg font-semibold text-white mb-1">建立帳號</h1>
          <p className="text-xs mb-5" style={{ color: '#64748b' }}>
            建立後即可擁有個人觀察清單與背景監控追蹤
          </p>

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
              <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>建立本站專用密碼（8–128 字元）</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                placeholder="••••••••"
                className="px-3 py-2 rounded-md text-sm outline-none"
                style={{ background: '#0f1117', border: '1px solid #2d3148', color: '#f1f5f9' }}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: '#94a3b8' }}>再次輸入本站專用密碼</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
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
              {loading ? '建立中…' : <><UserPlus size={14} />建立帳號</>}
            </button>
          </form>

          <p className="text-xs text-center mt-4" style={{ color: '#64748b' }}>
            已有帳號？{' '}
            <Link to="/login" style={{ color: '#10b981' }}>登入</Link>
          </p>
        </div>

        <p className="text-center text-xs mt-4" style={{ color: '#3d4163' }}>
          未登入仍可以訪客身分瀏覽公開資料
        </p>
      </div>
    </div>
  )
}
