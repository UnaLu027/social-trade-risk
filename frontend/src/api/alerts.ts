import { api } from './client'
import type { AlertResponse, WatchlistItem } from '../types/api'

export const getAlerts = (params?: { severity?: string; is_read?: boolean }) =>
  api.get<AlertResponse[]>('/api/v1/alerts', { params }).then((r) => r.data)

export const markAlertRead = (id: number) =>
  api.post(`/api/v1/alerts/${id}/read`).then((r) => r.data)

export const getWatchlist = () =>
  api.get<WatchlistItem[]>('/api/v1/watchlist').then((r) => r.data)

export const addToWatchlist = (symbol: string) =>
  api.post<WatchlistItem>('/api/v1/watchlist', { symbol }).then((r) => r.data)

export const removeFromWatchlist = (symbol: string) =>
  api.delete(`/api/v1/watchlist/${symbol}`).then((r) => r.data)
