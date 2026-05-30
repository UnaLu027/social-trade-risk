export type FreshnessStatus = 'fresh' | 'stale' | 'expired' | 'no_data'

export function getFreshnessStatus(lastRunAt: string | null | undefined): FreshnessStatus {
  if (!lastRunAt) return 'no_data'
  const diffMs = Date.now() - new Date(lastRunAt).getTime()
  const hours = diffMs / (1000 * 60 * 60)
  if (hours <= 6)  return 'fresh'
  if (hours <= 12) return 'stale'
  return 'expired'
}

export function formatFreshnessTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

export const FRESHNESS_LABEL: Record<FreshnessStatus, string> = {
  fresh:   '最新',
  stale:   '可能過期',
  expired: '資料已過期',
  no_data: '尚無排程紀錄',
}

export const FRESHNESS_COLOR: Record<FreshnessStatus, string> = {
  fresh:   '#10b981',
  stale:   '#f59e0b',
  expired: '#ef4444',
  no_data: '#64748b',
}
