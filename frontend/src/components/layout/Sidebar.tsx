import { NavLink, useNavigate } from 'react-router-dom'
import {
  ShieldAlert, MessageSquare, FileText, Brain,
  TrendingUp, LogIn, LogOut, User, BarChart3,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const coreNavItems = [
  { to: '/risk-monitor',             icon: ShieldAlert,   label: '風險監控中心' },
  { to: '/post-analyzer',            icon: MessageSquare, label: '貼文風險分析' },
  { to: '/financial-verification',   icon: BarChart3,     label: '半導體財報查證' },
  { to: '/risk-report/GME',          icon: FileText,      label: '風險報告' },
  { to: '/model-lab',                icon: Brain,         label: '模型實驗室' },
]

export function Sidebar() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <aside
      style={{ background: '#0d0f1a', borderRight: '1px solid #1f2235' }}
      className="w-56 flex-shrink-0 flex flex-col py-6 px-3 h-screen sticky top-0 overflow-y-auto"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 mb-8">
        <div
          className="w-7 h-7 rounded flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #10b981, #0ea5e9)' }}
        >
          <TrendingUp size={14} color="white" />
        </div>
        <div>
          <div className="text-xs font-semibold text-white leading-none">Social Trading</div>
          <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>Risk Copilot</div>
        </div>
      </div>

      {/* Core nav */}
      <nav className="flex flex-col gap-1 flex-1">
        <div
          className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2"
          style={{ color: '#3d4163' }}
        >
          核心功能
        </div>

        {coreNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'text-white bg-[#1e2235]'
                  : 'text-[#64748b] hover:text-[#94a3b8] hover:bg-[#151828]'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={15} color={isActive ? '#10b981' : undefined} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Auth section */}
      <div className="px-3 pt-4 flex flex-col gap-2" style={{ borderTop: '1px solid #1f2235' }}>
        {isAuthenticated ? (
          <>
            {/* Account indicator */}
            <div className="flex items-center gap-2 py-1">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#1e3a5f', border: '1px solid #2d4a6f' }}
              >
                <User size={10} color="#38bdf8" />
              </div>
              <span
                className="text-[10px] truncate flex-1"
                style={{ color: '#94a3b8' }}
                title={user?.email}
              >
                {user?.email}
              </span>
            </div>
            {/* Logout */}
            <button
              onClick={logout}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium w-full transition-colors"
              style={{ color: '#64748b' }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = '#151828'
                el.style.color = '#94a3b8'
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLButtonElement
                el.style.background = 'transparent'
                el.style.color = '#64748b'
              }}
            >
              <LogOut size={12} />
              登出
            </button>
          </>
        ) : (
          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium w-full transition-opacity hover:opacity-80"
            style={{ color: '#10b981', background: '#052e16', border: '1px solid #065f46' }}
          >
            <LogIn size={12} />
            登入 / 註冊
          </button>
        )}

        <div className="text-[10px]" style={{ color: '#3d4163' }}>官方財報量化證據</div>
        <div className="text-[10px]" style={{ color: '#3d4163' }}>僅供可信度風險查證</div>
      </div>
    </aside>
  )
}
