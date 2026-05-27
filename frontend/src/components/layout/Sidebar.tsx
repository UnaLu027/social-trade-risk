import { NavLink } from 'react-router-dom'
import { ShieldAlert, MessageSquare, FileText, FlaskConical, Brain, TrendingUp } from 'lucide-react'

const coreNavItems = [
  { to: '/risk-monitor',    icon: ShieldAlert,   label: '風險監控中心' },
  { to: '/post-analyzer',   icon: MessageSquare, label: '貼文風險分析' },
  { to: '/risk-report/GME', icon: FileText,      label: '風險報告' },
  { to: '/stress-test',     icon: FlaskConical,  label: '情境壓力測試' },
  { to: '/model-lab',       icon: Brain,         label: '模型實驗室' },
]

export function Sidebar() {
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

      {/* Footer */}
      <div className="px-3 pt-4" style={{ borderTop: '1px solid #1f2235' }}>
        <div className="text-[10px]" style={{ color: '#3d4163' }}>5 模型比較優選</div>
        <div className="text-[10px] mt-0.5" style={{ color: '#3d4163' }}>詳見「模型實驗室」</div>
      </div>
    </aside>
  )
}
