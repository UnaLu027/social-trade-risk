import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Calendar, Info } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getEventReplay } from '../api/eventReplay'
import { TopBar } from '../components/layout/TopBar'
import { TimelineChart } from '../components/charts/TimelineChart'
import type { EventMarker } from '../types/api'

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444', warning: '#f59e0b', info: '#38bdf8',
}

export function EventReplay() {
  const { activeTicker } = useAppStore()
  const [startDate, setStartDate] = useState('2021-01-01')
  const [endDate, setEndDate] = useState('2021-02-28')
  const [selectedEvent, setSelectedEvent] = useState<EventMarker | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['eventReplay', activeTicker, startDate, endDate],
    queryFn: () => getEventReplay(activeTicker, startDate, endDate),
    retry: 1,
  })

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="事件回放" />

      <div className="p-6 flex flex-col gap-5 animate-fadeIn">
        {/* Controls */}
        <div
          className="rounded-lg p-4 flex flex-wrap items-center gap-4"
          style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
        >
          <div className="flex items-center gap-2">
            <Calendar size={13} color="#64748b" />
            <span className="text-xs" style={{ color: '#64748b' }}>起始日期</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: '#131627', border: '1px solid #2d3148', color: '#f1f5f9' }}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: '#64748b' }}>結束日期</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: '#131627', border: '1px solid #2d3148', color: '#f1f5f9' }}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            {['2021 GME 軋空', '2021 AMC 飆漲'].map((label) => (
              <button
                key={label}
                onClick={() => {
                  if (label.includes('GME')) { setStartDate('2021-01-01'); setEndDate('2021-02-28') }
                  else { setStartDate('2021-05-01'); setEndDate('2021-06-30') }

                }}
                className="text-xs px-3 py-1 rounded transition-colors"
                style={{ background: '#222536', border: '1px solid #2d3148', color: '#94a3b8' }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Main chart */}
        <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
              股價 · 社群提及 · 炒作分數
            </span>
            {data && (
              <span className="text-xs" style={{ color: '#3d4163' }}>
                {data.timeline.length} 個資料點
              </span>
            )}
          </div>
          {isLoading ? (
            <div className="h-80 animate-pulse rounded" style={{ background: '#131627' }} />
          ) : data ? (
            <TimelineChart
              data={data.timeline}
              eventMarkers={data.event_markers}
              onEventClick={setSelectedEvent}
            />
          ) : (
            <div className="h-80 flex items-center justify-center" style={{ color: '#3d4163' }}>
              無資料。請啟動後端並匯入 GME 2021 資料。
            </div>
          )}
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-3 gap-4">
          {/* Event markers list */}
          <div className="col-span-1 rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
            <span className="text-xs font-semibold uppercase tracking-wider block mb-3" style={{ color: '#64748b' }}>
              事件標記
            </span>
            <div className="flex flex-col gap-2">
              {data?.event_markers.length ? data.event_markers.map((m, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 cursor-pointer py-1.5 px-2 rounded transition-colors"
                  style={{ borderLeft: `2px solid ${SEVERITY_COLORS[m.type] || '#64748b'}` }}
                  onClick={() => setSelectedEvent(m)}
                >
                  <div className="flex flex-col">
                    <span className="text-xs font-medium" style={{ color: '#f1f5f9' }}>{m.label}</span>
                    <span className="text-[10px]" style={{ color: '#64748b' }}>
                      {new Date(m.ts).toLocaleDateString('zh-TW', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              )) : (
                <p className="text-xs" style={{ color: '#3d4163' }}>此區間無事件</p>
              )}
            </div>
          </div>

          {/* AI explanation */}
          <div className="col-span-2 rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
            <div className="flex items-center gap-2 mb-3">
              <Info size={12} color="#38bdf8" />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                分析摘要
              </span>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-3 rounded animate-pulse" style={{ background: '#2d3148', width: i === 2 ? '70%' : '100%' }} />
                ))}
              </div>
            ) : (
              <p className="text-sm leading-relaxed" style={{ color: '#94a3b8' }}>
                {data?.ai_explanation || '請選擇日期區間以查看分析摘要。'}
              </p>
            )}
            {selectedEvent && (
              <div
                className="mt-4 p-3 rounded-lg"
                style={{ background: '#131627', border: `1px solid ${SEVERITY_COLORS[selectedEvent.type] || '#2d3148'}` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: SEVERITY_COLORS[selectedEvent.type] || '#64748b' }}
                  />
                  <span className="text-xs font-semibold" style={{ color: '#f1f5f9' }}>{selectedEvent.label}</span>
                </div>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  {new Date(selectedEvent.ts).toLocaleDateString('zh-TW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
