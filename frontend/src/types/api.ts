export interface PricePoint {
  ts: string
  close: number
  volume: number
}

export interface PostCard {
  post_id: string
  body_snippet: string
  author: string
  score: number
  sentiment: number
  is_bullish: boolean
  url: string
  ts: string
}

export interface NewsItem {
  title: string
  publisher: string
  link: string
  published_at: string
  sentiment_score: number
}

export interface MarketPulseResponse {
  ticker: string
  price: number
  price_change_pct: number
  volume: number
  volume_spike_ratio: number
  hype_score: number
  hype_label: string
  mention_count_1h: number
  mention_count_24h: number
  bullish_ratio: number
  avg_sentiment: number
  top_drivers: string[]
  ml_risk_prob: number[]
  top_posts: PostCard[]
  price_history_24h: PricePoint[]
  news_items: NewsItem[]
}

export interface ScreenerItem {
  symbol: string
  name: string
  hype_score: number | null
  hype_label: string
  price: number | null
  price_change_pct: number | null
  volume_spike: number | null
  ml_risk_label: number | null
  ml_risk_text: string
  mention_count_24h: number
}

export interface TrendingTicker {
  symbol: string
  mention_count: number
  avg_sentiment: number
  subreddits_active: string[]
}

export interface TickerSummary {
  symbol: string
  name: string | null
  hype_score: number
  hype_label: string
  price_change_pct: number
}

export interface TimelinePoint {
  ts: string
  close: number | null
  volume: number | null
  mention_count: number
  hype_score: number | null
  events: { label: string; type: string }[]
}

export interface EventMarker {
  ts: string
  label: string
  type: string
  note?: string
}

export interface EventReplayResponse {
  ticker: string
  start_date: string
  end_date: string
  timeline: TimelinePoint[]
  event_markers: EventMarker[]
  ai_explanation: string
}

export interface AlertResponse {
  id: number
  ticker: string
  severity: string
  rule_name: string
  message: string
  hype_score: number | null
  ts: string
  is_read: boolean
  trigger_explanation: string
}

export interface WatchlistItem {
  symbol: string
  hype_score: number | null
  hype_label: string | null
  price_change_pct: number | null
  added_at: string
}

export interface ScenarioRequest {
  mention_growth: number
  bullish_ratio: number
  hype_score: number
  influencer_activity: number
  short_interest: number
  option_activity: number
  trading_restriction: boolean
}

export interface ScenarioResponse {
  risk_label: string
  risk_label_text: string
  risk_probabilities: Record<string, number>
  hype_score_computed: number
  dominant_factor: string
  explanation: string
  comparable_event: { ticker: string; date: string; similarity_pct: number } | null
}
