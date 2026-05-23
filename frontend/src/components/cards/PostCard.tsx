import { ArrowUpRight, TrendingUp, TrendingDown } from 'lucide-react'
import type { PostCard as PostCardType } from '../../types/api'

export function PostCard({ post }: { post: PostCardType }) {
  const sentColor = post.sentiment > 0.1 ? '#10b981' : post.sentiment < -0.1 ? '#ef4444' : '#64748b'

  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-2"
      style={{ background: '#131627', border: '1px solid #1f2235' }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-relaxed flex-1" style={{ color: '#94a3b8' }}>
          {post.body_snippet.substring(0, 120)}
          {post.body_snippet.length > 120 && '…'}
        </p>
        {post.url && (
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 p-1 rounded"
            style={{ color: '#64748b' }}
          >
            <ArrowUpRight size={12} />
          </a>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px]" style={{ color: '#3d4163' }}>
          {post.author} · ▲{post.score.toLocaleString()}
        </span>
        <div className="flex items-center gap-1">
          {post.is_bullish ? (
            <TrendingUp size={10} color="#10b981" />
          ) : (
            <TrendingDown size={10} color="#ef4444" />
          )}
          <span className="text-[10px] font-mono" style={{ color: sentColor }}>
            {post.sentiment > 0 ? '+' : ''}{post.sentiment.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}
