import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'

// Core product pages
import { RiskMonitor }      from './pages/RiskMonitor'
import { PostAnalyzer }     from './pages/PostAnalyzer'
import { RiskReport }       from './pages/RiskReport'
import { StressTest }       from './pages/StressTest'
import { ModelLab }         from './pages/ModelLab'

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

// Suppress "imported but never used" — legacy pages are kept for reference only.
void MarketPulse; void EventReplay; void AlertCenter; void ScenarioLab
void MarketScreener; void MarketOverview; void FakeNewsDetector; void ModelInsights

export default function App() {
  return (
    <HashRouter>
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
    </HashRouter>
  )
}
