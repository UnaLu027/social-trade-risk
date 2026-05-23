import { api } from './client'
import type { ScreenerItem, TrendingTicker } from '../types/api'

export const getScreener = () => api.get<ScreenerItem[]>('/api/v1/screener').then(r => r.data)
export const getTrending = () =>
  api.get<{ trending: TrendingTicker[] }>('/api/v1/trending').then(r => r.data.trending ?? [])
