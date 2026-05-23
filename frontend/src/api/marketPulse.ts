import { api } from './client'
import type { MarketPulseResponse, TickerSummary } from '../types/api'

export const getMarketPulse = (ticker: string) =>
  api.get<MarketPulseResponse>(`/api/v1/market-pulse/${ticker}`).then((r) => r.data)

export const getWatchlistTickers = () =>
  api.get<TickerSummary[]>('/api/v1/market-pulse/').then((r) => r.data)
