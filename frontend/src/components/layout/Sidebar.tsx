import { NavLink } from 'react-router-dom'
import { Activity, Clock, Bell, FlaskConical, TrendingUp, BarChart3 } from 'lucide-react'

const navItems = [
  { to: '/market-pulse', icon: Activity, label: '市場脈動' },
  { to: '/screener', icon: BarChart3, label: '市場篩選器' },
  { to: '/event-replay', icon: Clock, label: '事件回放' },
  { to: '/alerts', icon: Bell, label: '警報中心' },
  { to: '/scenario', icon: FlaskConical, label: '情境模擬' },
]

export function Sidebar() {
  return (
    <aside
      style={{ background: '#0d0f1a', borderRight: '1px solid #1f2235' }}
      className="w-56 flex-shrink-0 flex flex-col py-6 px-3 h-screen sticky top-0"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 mb-8">
        <div className="w-7 h-7 rounded flex items-center justify-center"
             style={{ background: 'linear-gradient(135deg, #10b981, #0ea5e9)' }}>
          <TrendingUp size={14} color="white" />
        </div>
        <div>
          <div className="text-xs font-semibold text-white leading-none">社交交易</div>
          <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>智慧分析平台</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-2"
             style={{ color: '#3d4163' }}>分析功能</div>
        {navItems.map(({ to, icon: Icon, label }) => (
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

      {/* Footer */}
      <div className="px-3 pt-4" style={{ borderTop: '1px solid #1f2235' }}>
        <div className="text-[10px]" style={{ color: '#3d4163' }}>
          採用疊加集成分類器
        </div>
        <div className="text-[10px] mt-0.5" style={{ color: '#3d4163' }}>
          F1 加權分數：0.9975
        </div>
      </div>
    </aside>
  )
}
