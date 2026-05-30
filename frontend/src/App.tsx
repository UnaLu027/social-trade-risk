import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Sidebar } from './components/layout/Sidebar'

// Core product pages
import { RiskMonitor }      from './pages/RiskMonitor'
import { PostAnalyzer }     from './pages/PostAnalyzer'
import { RiskReport }       from './pages/RiskReport'
import { StressTest }       from './pages/StressTest'
import { ModelLab }         from './pages/ModelLab'

// Auth pages
import { Login }           from './pages/Login'
import { Register }        from './pages/Register'
import { SecurityNotice }  from './pages/SecurityNotice'

// Legacy page imports kept to avoid breaking existing build artifacts;
// all legacy routes below redirect to /risk-monitor.
import { MarketPulse }      from './pages/MarketPulse'
import { EventReplay }      from './pages/EventReplay'
import { AlertCenter }      from './pages/AlertCenter'
import { ScenarioLab }      from './pages/ScenarioLab'
import { MarketScreener }   from './pages/MarketScreener'
import { MarketOverview }   from './pages/MarketOverview'
import { FakeNewsDetector } from './pages/FakeNewsDetector'
import { ModelInsights }    from './pages/ModelInsights'

void MarketPulse; void EventReplay; void AlertCenter; void ScenarioLab
void MarketScreener; void MarketOverview; void FakeNewsDetector; void ModelInsights

// AppRoutes needs useLocation and useAuth so it lives inside HashRouter + AuthProvider
function AppRoutes() {
  const location = useLocation()
  const { authLoading } = useAuth()
  const isAuthPage = location.pathname === '/login'
    || location.pathname === '/register'
    || location.pathname === '/security-notice'

  // While validating a stored token via /auth/me, render a neutral loading screen.
  // This prevents guest-mode RiskMonitor from mounting (and firing HF requests for
  // localStorage symbols) before we know whether the user has an active session.
  if (authLoading && !isAuthPage) {
    return (
      <div
        className="flex items-center justify-center w-full min-h-screen"
        style={{ background: '#0f1117' }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="w-7 h-7 rounded-full border-2 animate-spin"
            style={{ borderColor: '#10b981', borderTopColor: 'transparent' }}
          />
          <span className="text-xs" style={{ color: '#64748b' }}>正在驗證登入狀態…</span>
        </div>
      </div>
    )
  }

  // Auth / public-info pages: full-screen, no sidebar
  if (isAuthPage) {
    return (
      <Routes>
        <Route path="/login"            element={<Login />} />
        <Route path="/register"         element={<Register />} />
        <Route path="/security-notice"  element={<SecurityNotice />} />
      </Routes>
    )
  }

  // Main app: sidebar + page area
  return (
    <div className="flex w-full min-h-screen" style={{ background: '#0f1117' }}>
      <Sidebar />
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <Routes>
          {/* Default */}
          <Route path="/"                    element={<Navigate to="/risk-monitor" replace />} />

          {/* Core product pages */}
          <Route path="/risk-monitor"        element={<RiskMonitor />} />
          <Route path="/post-analyzer"       element={<PostAnalyzer />} />
          <Route path="/risk-report/:symbol" element={<RiskReport />} />
          <Route path="/risk-report"         element={<Navigate to="/risk-report/GME" replace />} />
          <Route path="/stress-test"         element={<StressTest />} />
          <Route path="/model-lab"           element={<ModelLab />} />

          {/* Legacy routes — all redirect to risk-monitor */}
          <Route path="/market-pulse"        element={<Navigate to="/risk-monitor" replace />} />
          <Route path="/overview"            element={<Navigate to="/risk-monitor" replace />} />
          <Route path="/screener"            element={<Navigate to="/risk-monitor" replace />} />
          <Route path="/event-replay"        element={<Navigate to="/risk-monitor" replace />} />
          <Route path="/alerts"              element={<Navigate to="/risk-monitor" replace />} />
          <Route path="/scenario"            element={<Navigate to="/risk-monitor" replace />} />
          <Route path="/fake-news"           element={<Navigate to="/risk-monitor" replace />} />
          <Route path="/model-insights"      element={<Navigate to="/risk-monitor" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  )
}
