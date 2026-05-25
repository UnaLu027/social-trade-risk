import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './components/layout/Sidebar'
import { MarketPulse } from './pages/MarketPulse'
import { EventReplay } from './pages/EventReplay'
import { AlertCenter } from './pages/AlertCenter'
import { ScenarioLab } from './pages/ScenarioLab'
import { MarketScreener } from './pages/MarketScreener'
import { MarketOverview } from './pages/MarketOverview'
import { FakeNewsDetector } from './pages/FakeNewsDetector'
import { ModelInsights } from './pages/ModelInsights'

export default function App() {
  return (
    <BrowserRouter basename="/social-trade-risk">
      <div className="flex w-full min-h-screen" style={{ background: '#0f1117' }}>
        <Sidebar />
        <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
          <Routes>
            <Route path="/" element={<Navigate to="/market-pulse" replace />} />
            <Route path="/market-pulse" element={<MarketPulse />} />
            <Route path="/overview" element={<MarketOverview />} />
            <Route path="/screener" element={<MarketScreener />} />
            <Route path="/event-replay" element={<EventReplay />} />
            <Route path="/alerts" element={<AlertCenter />} />
            <Route path="/scenario" element={<ScenarioLab />} />
            <Route path="/fake-news" element={<FakeNewsDetector />} />
            <Route path="/model-insights" element={<ModelInsights />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
