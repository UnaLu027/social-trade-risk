import { api } from './client'
import type { EventReplayResponse } from '../types/api'

export const getEventReplay = (ticker: string, startDate?: string, endDate?: string) => {
  const params: Record<string, string> = {}
  if (startDate) params.start_date = startDate
  if (endDate) params.end_date = endDate
  return api.get<EventReplayResponse>(`/api/v1/event-replay/${ticker}`, { params }).then((r) => r.data)
}
