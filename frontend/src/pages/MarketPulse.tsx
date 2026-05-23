import { useQuery } from '@tanstack/react-query'
import { Activity, TrendingUp, TrendingDown, Users, Zap, BarChart2, Newspaper } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { getMarketPulse } from '../api/marketPulse'
import { TopBar } from '../components/layout/TopBar'
import { HypeGauge } from '../components/charts/HypeGauge'
import { PriceChart } from '../components/charts/PriceChart'
import { SentimentBar } from '../components/charts/SentimentBar'
import { StatCard } from '../components/cards/StatCard'
import { PostCard } from '../components/cards/PostCard'

function SkeletonCard() {
  return (
    <div className="rounded-lg p-4 animate-pulse" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
      <div className="h-3 w-24 rounded mb-2" style={{ background: '#2d3148' }} />
      <div className="h-7 w-32 rounded" style={{ background: '#2d3148' }} />
    </div>
  )
}

export function MarketPulse() {
  const { activeTicker } = useAppStore()
  const { data, isLoading, error } = useQuery({
    queryKey: ['marketPulse', activeTicker],
    queryFn: () => getMarketPulse(activeTicker),
    refetchInterval: 30_000,
    staleTime: 25_000,
    retry: 1,
  })

  const isPositive = (data?.price_change_pct ?? 0) >= 0

  return (
    <div className="flex flex-col flex-1 overflow-auto">
      <TopBar title="市場脈動" />

      {error && (
        <div className="mx-6 mt-4 px-4 py-3 rounded-lg text-sm" style={{ background: '#450a0a', border: '1px solid #7f1d1d', color: '#ef4444' }}>
          後端伺服器未回應。請啟動 FastAPI 並重新整理。
        </div>
      )}

      <div className="p-6 flex flex-col gap-6 animate-fadeIn">
        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <StatCard
                label="股價"
                value={data ? `$${data.price.toFixed(2)}` : '—'}
                subValue={data ? `${isPositive ? '+' : ''}${data.price_change_pct.toFixed(2)}% 24小時` : undefined}
                trend={isPositive ? 'up' : 'down'}
                icon={isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                accentColor={isPositive ? '#10b981' : '#ef4444'}
              />
              <StatCard
                label="成交量"
                value={data ? `${(data.volume / 1_000_000).toFixed(1)}M` : '—'}
                subValue={data ? `${data.volume_spike_ratio.toFixed(1)}× 均量` : undefined}
                trend={data && data.volume_spike_ratio > 2 ? 'up' : 'neutral'}
                icon={<BarChart2 size={14} />}
                accentColor="#38bdf8"
              />
              <StatCard
                label="24小時提及數"
                value={data ? data.mention_count_24h.toLocaleString() : '—'}
                subValue={data ? `過去一小時 ${data.mention_count_1h} 次` : undefined}
                icon={<Users size={14} />}
                accentColor="#38bdf8"
              />
              <StatCard
                label="平均情緒"
                value={data ? (data.avg_sentiment > 0 ? '+' : '') + data.avg_sentiment.toFixed(3) : '—'}
                subValue={data ? `看漲 ${(data.bullish_ratio * 100).toFixed(0)}%` : undefined}
                trend={data && data.avg_sentiment > 0.1 ? 'up' : data && data.avg_sentiment < -0.1 ? 'down' : 'neutral'}
                icon={<Activity size={14} />}
                accentColor={data && data.avg_sentiment > 0 ? '#10b981' : '#ef4444'}
              />
            </>
          )}
        </div>

        {/* Main content */}
        <div className="grid grid-cols-5 gap-4">
          {/* Left: charts */}
          <div className="col-span-3 flex flex-col gap-4">
            {/* Price chart */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                  股價走勢 — 24小時
                </span>
                <span className="text-xs tabular-nums" style={{ color: isPositive ? '#10b981' : '#ef4444' }}>
                  {data ? `${isPositive ? '▲' : '▼'} ${Math.abs(data.price_change_pct).toFixed(2)}%` : ''}
                </span>
              </div>
              {data ? (
                <PriceChart data={data.price_history_24h} positive={isPositive} />
              ) : (
                <div className="h-40 animate-pulse rounded" style={{ background: '#131627' }} />
              )}
            </div>

            {/* Sentiment bar */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <span className="text-xs font-semibold uppercase tracking-wider block mb-3" style={{ color: '#64748b' }}>
                情緒分佈
              </span>
              {data ? (
                <SentimentBar bullishRatio={data.bullish_ratio} />
              ) : (
                <div className="h-8 animate-pulse rounded-full" style={{ background: '#131627' }} />
              )}
            </div>

            {/* Risk drivers */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <span className="text-xs font-semibold uppercase tracking-wider block mb-3" style={{ color: '#64748b' }}>
                風險驅動因素
              </span>
              <div className="flex flex-wrap gap-2">
                {data ? data.top_drivers.map((d, i) => (
                  <span
                    key={i}
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{
                      background: '#222536',
                      border: '1px solid #2d3148',
                      color: i === 0 ? '#f59e0b' : '#94a3b8',
                    }}
                  >
                    {d}
                  </span>
                )) : <div className="h-6 w-32 rounded-full animate-pulse" style={{ background: '#2d3148' }} />}
              </div>
            </div>

            {/* News section */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <div className="flex items-center gap-2 mb-3">
                <Newspaper size={13} color="#38bdf8" />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                  最新新聞
                </span>
              </div>
              {isLoading ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-12 rounded animate-pulse" style={{ background: '#131627' }} />
                  ))}
                </div>
              ) : data?.news_items?.length ? (
                <div className="flex flex-col gap-2">
                  {data.news_items.slice(0, 5).map((item, i) => {
                    const sentScore = item.sentiment_score
                    const sentLabel = sentScore > 0.05 ? '看漲' : sentScore < -0.05 ? '看跌' : '中性'
                    const sentColor = sentScore > 0.05 ? '#10b981' : sentScore < -0.05 ? '#ef4444' : '#38bdf8'
                    const sentBg = sentScore > 0.05 ? '#052e16' : sentScore < -0.05 ? '#450a0a' : '#0c1a2e'
                    const title =
                      item.title.length > 80 ? item.title.slice(0, 80) + '…' : item.title
                    const dateStr = item.published_at
                      ? new Date(item.published_at).toLocaleDateString('zh-TW', {
                          month: 'numeric',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''
                    return (
                      <a
                        key={i}
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex flex-col gap-1 px-3 py-2 rounded-md transition-colors"
                        style={{ background: '#131627', border: '1px solid #1f2235', textDecoration: 'none' }}
                        onMouseEnter={(e) =>
                          ((e.currentTarget as HTMLAnchorElement).style.background = '#1a1e30')
                        }
                        onMouseLeave={(e) =>
                          ((e.currentTarget as HTMLAnchorElement).style.background = '#131627')
                        }
                      >
                        <div className="text-xs font-medium leading-snug" style={{ color: '#f1f5f9' }}>
                          {title}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs" style={{ color: '#64748b' }}>
                            {item.publisher}
                          </span>
                          {dateStr && (
                            <span className="text-xs" style={{ color: '#64748b' }}>
                              · {dateStr}
                            </span>
                          )}
                          <span
                            className="text-xs font-semibold px-1.5 py-0.5 rounded-full ml-auto"
                            style={{ background: sentBg, color: sentColor, border: `1px solid ${sentColor}33` }}
                          >
                            {sentLabel}
                          </span>
                        </div>
                      </a>
                    )
                  })}
                </div>
              ) : (
                <div className="text-xs" style={{ color: '#64748b' }}>暫無新聞資料</div>
              )}
            </div>
          </div>

          {/* Right: gauge + ML + posts */}
          <div className="col-span-2 flex flex-col gap-4">
            {/* Hype gauge */}
            <div
              className="rounded-lg p-4 flex flex-col items-center gap-3"
              style={{ background: '#1a1d27', border: '1px solid #2d3148' }}
            >
              <span className="text-xs font-semibold uppercase tracking-wider self-start" style={{ color: '#64748b' }}>
                炒作風險分數
              </span>
              {data ? (
                <HypeGauge score={data.hype_score} label={data.hype_label} size={150} />
              ) : (
                <div className="w-36 h-28 animate-pulse rounded-full" style={{ background: '#131627' }} />
              )}
            </div>

            {/* ML probability */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <span className="text-xs font-semibold uppercase tracking-wider block mb-3" style={{ color: '#64748b' }}>
                ML 風險機率
              </span>
              {data ? (
                <div className="flex flex-col gap-2">
                  {[
                    { label: '低風險', color: '#10b981', prob: data.ml_risk_prob[0] },
                    { label: '中風險', color: '#f59e0b', prob: data.ml_risk_prob[1] },
                    { label: '高風險', color: '#ef4444', prob: data.ml_risk_prob[2] },
                  ].map(({ label, color, prob }) => (
                    <div key={label}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs" style={{ color: '#64748b' }}>{label}</span>
                        <span className="text-xs font-mono" style={{ color }}>{(prob * 100).toFixed(1)}%</span>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: '#2d3148' }}>
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${prob * 100}%`, background: color }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-4 rounded animate-pulse" style={{ background: '#2d3148' }} />
                  ))}
                </div>
              )}
            </div>

            {/* Top posts */}
            <div className="rounded-lg p-4" style={{ background: '#1a1d27', border: '1px solid #2d3148' }}>
              <div className="flex items-center gap-2 mb-3">
                <Zap size={12} color="#f59e0b" />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                  社群熱度
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {data?.top_posts.length ? (
                  data.top_posts.slice(0, 3).map((p) => <PostCard key={p.post_id} post={p} />)
                ) : (
                  Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="h-16 rounded animate-pulse" style={{ background: '#131627' }} />
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
