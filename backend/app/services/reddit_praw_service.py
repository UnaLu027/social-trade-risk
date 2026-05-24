"""
Reddit data fetching using official PRAW library.
Set env vars: REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT
Falls back gracefully if credentials not configured.
"""
import os
from app.services.sentiment_service import score_text

SUBREDDITS = ["wallstreetbets", "stocks", "options", "StockMarket", "investing", "pennystocks"]


def _get_reddit():
    """Get PRAW Reddit instance, returns None if not configured."""
    client_id = os.getenv("REDDIT_CLIENT_ID", "")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET", "")
    user_agent = os.getenv("REDDIT_USER_AGENT", "SocialTradeRisk/1.0")
    if not client_id or not client_secret:
        return None
    try:
        import praw
        return praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=user_agent,
        )
    except Exception as e:
        print(f"[reddit_praw] Init error: {e}")
        return None


def fetch_ticker_mentions(symbol: str, limit: int = 50) -> list[dict]:
    """Fetch recent Reddit mentions for a ticker symbol."""
    reddit = _get_reddit()
    if not reddit:
        return []
    results = []
    try:
        for sub in SUBREDDITS:
            try:
                subreddit = reddit.subreddit(sub)
                for post in subreddit.search(
                    f"${symbol} OR {symbol}",
                    sort="new",
                    limit=limit // len(SUBREDDITS) + 1,
                    time_filter="week",
                ):
                    text = (post.title + " " + (post.selftext or ""))[:500]
                    sentiment = score_text(text)
                    results.append({
                        "source": f"reddit/{sub}",
                        "post_id": post.id,
                        "body_snippet": post.title[:200],
                        "author": str(post.author) if post.author else "deleted",
                        "score": post.score,
                        "sentiment_score": sentiment,
                        "is_bullish": sentiment > 0.05,
                        "url": f"https://reddit.com{post.permalink}",
                    })
            except Exception:
                continue
    except Exception as e:
        print(f"[reddit_praw] fetch error for {symbol}: {e}")
    return results


def fetch_trending_posts(limit_per_sub: int = 100) -> list[dict]:
    """Fetch hot posts from multiple subreddits for trending detection."""
    reddit = _get_reddit()
    if not reddit:
        return []
    all_posts = []
    for sub in SUBREDDITS:
        try:
            subreddit = reddit.subreddit(sub)
            for post in subreddit.hot(limit=limit_per_sub):
                text = (post.title + " " + (post.selftext or ""))[:500]
                all_posts.append({
                    "subreddit": sub,
                    "title": post.title,
                    "selftext": post.selftext or "",
                    "score": post.score,
                    "text": text,
                })
        except Exception as e:
            print(f"[reddit_praw] hot posts error for r/{sub}: {e}")
    return all_posts
