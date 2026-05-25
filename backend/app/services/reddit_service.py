import hashlib
from datetime import datetime, timezone
from typing import Optional
import httpx
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models import Ticker, SocialMention
from app.config import get_settings

settings = get_settings()

HEADERS = {"User-Agent": settings.reddit_user_agent}


def _reddit_post_id(post: dict) -> str:
    return post.get("id", hashlib.md5(str(post).encode()).hexdigest()[:12])


def fetch_reddit_posts(
    symbol: str,
    limit: int = 100,
    subreddit: str = "wallstreetbets",
) -> list[dict]:
    url = f"{settings.reddit_base_url}/r/{subreddit}/search.json"
    params = {"q": symbol, "sort": "new", "limit": limit, "t": "day", "restrict_sr": "1"}
    try:
        with httpx.Client(timeout=10, headers=HEADERS) as client:
            resp = client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            return [item["data"] for item in data.get("data", {}).get("children", [])]
    except Exception as e:
        print(f"[reddit] Fetch failed for {symbol} in r/{subreddit}: {e}")
        return []


def fetch_reddit_posts_multi(
    symbol: str,
    limit: int = 100,
    subreddits: list[str] | None = None,
) -> list[dict]:
    """Fetch posts for a symbol across multiple subreddits, deduplicating by post id."""
    if subreddits is None:
        subreddits = ["wallstreetbets", "stocks", "StockMarket"]
    seen_ids: set[str] = set()
    all_posts: list[dict] = []
    for sub in subreddits:
        posts = fetch_reddit_posts(symbol, limit=limit, subreddit=sub)
        for post in posts:
            pid = _reddit_post_id(post)
            if pid not in seen_ids:
                seen_ids.add(pid)
                all_posts.append(post)
    return all_posts


def store_mentions(db: Session, ticker_id: int, posts: list[dict], score_func) -> int:
    inserted = 0
    for post in posts:
        post_id = f"reddit_{_reddit_post_id(post)}"
        exists = db.execute(
            select(SocialMention).where(SocialMention.post_id == post_id)
        ).scalar_one_or_none()
        if exists:
            continue

        title = post.get("title", "")
        body = post.get("selftext", "")
        text = (title + " " + body).strip()[:500]
        score = post.get("score", 0)
        author = post.get("author", "unknown")
        url = f"https://reddit.com{post.get('permalink', '')}"

        created_utc = post.get("created_utc", 0)
        ts = datetime.fromtimestamp(created_utc, tz=timezone.utc).replace(tzinfo=None)

        sentiment = score_func(text)
        is_bullish = sentiment > 0.05

        mention = SocialMention(
            ticker_id=ticker_id,
            ts=ts,
            source="reddit",
            post_id=post_id,
            body_snippet=text[:300],
            author=author,
            score=score,
            sentiment_score=round(sentiment, 4),
            is_bullish=is_bullish,
            url=url,
        )
        db.add(mention)
        inserted += 1

    db.commit()
    return inserted


def get_recent_mentions(db: Session, ticker_id: int, hours: int = 24, limit: int = 10) -> list[SocialMention]:
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(hours=hours)
    return db.execute(
        select(SocialMention)
        .where(SocialMention.ticker_id == ticker_id, SocialMention.ts >= since)
        .order_by(SocialMention.score.desc())
        .limit(limit)
    ).scalars().all()


def count_mentions(db: Session, ticker_id: int, hours: int) -> int:
    from datetime import timedelta
    from sqlalchemy import func
    since = datetime.utcnow() - timedelta(hours=hours)
    result = db.execute(
        select(func.count()).select_from(SocialMention)
        .where(SocialMention.ticker_id == ticker_id, SocialMention.ts >= since)
    ).scalar()
    return int(result or 0)


def get_sentiment_stats(db: Session, ticker_id: int, hours: int = 24) -> dict:
    from datetime import timedelta
    since = datetime.utcnow() - timedelta(hours=hours)
    rows = db.execute(
        select(SocialMention)
        .where(SocialMention.ticker_id == ticker_id, SocialMention.ts >= since)
    ).scalars().all()
    if not rows:
        return {"avg_sentiment": 0.0, "bullish_ratio": 0.5, "count": 0, "influencer_score": 0.0}
    sentiments = [float(r.sentiment_score or 0) for r in rows]
    bullish = sum(1 for r in rows if r.is_bullish)
    top_score = max(r.score or 0 for r in rows)
    return {
        "avg_sentiment": sum(sentiments) / len(sentiments),
        "bullish_ratio": bullish / len(rows),
        "count": len(rows),
        "influencer_score": float(top_score),
    }
