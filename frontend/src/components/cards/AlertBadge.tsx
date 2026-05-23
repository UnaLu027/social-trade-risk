const SEVERITY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: '#450a0a', text: '#ef4444', border: '#7f1d1d' },
  high: { bg: '#451a03', text: '#f59e0b', border: '#78350f' },
  medium: { bg: '#0c1a3d', text: '#38bdf8', border: '#0c4a6e' },
  low: { bg: '#064e3b', text: '#10b981', border: '#065f46' },
}

export function AlertBadge({ severity }: { severity: string }) {
  const c = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.low

  return (
    <span
      className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {severity}
    </span>
  )
}
