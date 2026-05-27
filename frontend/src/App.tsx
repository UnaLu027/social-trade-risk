import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'

// New core pages
import { RiskMonitor }      from './pages/RiskMonitor'
import { PostAnalyzer }     from './pages/PostAnalyzer'
import { RiskReport }       from './pages/RiskReport'
import { StressTest }       from './pages/StressTest'
import { ModelLab }         from './pages/ModelLab'

// Legacy pages (preserved, not deleted)
import { MarketPulse }      from './pages/MarketPulse'
import { EventReplay }      from './pages/EventReplay'
import { AlertCenter }      from './pages/AlertCenter'
import { ScenarioLab }      from './pages/ScenarioLab'
import { MarketScreener }   from './pages/MarketScreener'
import { MarketOverview }   from './pages/MarketOverview'
import { FakeNewsDetector } from './pages/FakeNewsDetector'
import { ModelInsights }    from './pages/ModelInsights'

export default function App() {
  return (
    <HashRouter>
      <div className="flex w-full min-h-screen" style={{ background: '#0f1117' }}>
        <Sidebar />
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
          <Routes>
            {/* Default → risk monitor */}
            <Route path="/"                         element={<Navigate to="/risk-monitor" replace />} />

            {/* Core product pages */}
            <Route path="/risk-monitor"             element={<RiskMonitor />} />
            <Route path="/post-analyzer"            element={<PostAnalyzer />} />
            <Route path="/risk-report/:symbol"      element={<RiskReport />} />
            <Route path="/risk-report"              element={<Navigate to="/risk-report/GME" replace />} />
            <Route path="/stress-test"              element={<StressTest />} />
            <Route path="/model-lab"                element={<ModelLab />} />

            {/* Legacy dashboard (preserved) */}
            <Route path="/market-pulse"             element={<MarketPulse />} />
            <Route path="/overview"                 element={<MarketOverview />} />
            <Route path="/screener"                 element={<MarketScreener />} />
            <Route path="/event-replay"             element={<EventReplay />} />
            <Route path="/alerts"                   element={<AlertCenter />} />
            <Route path="/scenario"                 element={<ScenarioLab />} />
            <Route path="/fake-news"                element={<FakeNewsDetector />} />
            <Route path="/model-insights"           element={<ModelInsights />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
