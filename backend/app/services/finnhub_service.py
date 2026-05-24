"""
Finnhub API - free tier: 60 calls/min, includes financial news + sentiment.
Set env var: FINNHUB_API_KEY
"""
import os
import httpx
from datetime import datetime, timedelta, timezone

BASE_URL = "https://finnhub.io/api/v1"


def _key() -> str:
    return os.getenv("FINNHUB_API_KEY", "")


def get_news(symbol: str, limit: int = 10) -> list[dict]:
    """Fetch recent news for a stock symbol."""
    if not _key():
        return []
    try:
        end = datetime.now(timezone.utc)
        start = end - timedelta(days=7)
        resp = httpx.get(
            f"{BASE_URL}/company-news",
            params={
                "symbol": symbol,
                "from": start.strftime("%Y-%m-%d"),
                "to": end.strftime("%Y-%m-%d"),
                "token": _key(),
            },
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        articles = resp.json()[:limit]
        return [
            {
                "headline": a.get("headline", ""),
                "summary": a.get("summary", "")[:300],
                "source": a.get("source", ""),
                "url": a.get("url", ""),
                "published_at": datetime.fromtimestamp(
                    a.get("datetime", 0), tz=timezone.utc
                ).isoformat(),
                "sentiment": 0.0,  # Finnhub news doesn't include sentiment on free tier
            }
            for a in articles
            if a.get("headline")
        ]
    except Exception as e:
        print(f"[finnhub] News error for {symbol}: {e}")
        return []


def get_market_news(category: str = "general", limit: int = 20) -> list[dict]:
    """Fetch general market news."""
    if not _key():
        return []
    try:
        resp = httpx.get(
            f"{BASE_URL}/news",
            params={"category": category, "token": _key()},
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        return resp.json()[:limit]
    except Exception as e:
        print(f"[finnhub] Market news error: {e}")
        return []


def get_social_sentiment(symbol: str) -> dict:
    """Get Reddit + Twitter sentiment from Finnhub (free tier includes this)."""
    if not _key():
        return {}
    try:
        resp = httpx.get(
            f"{BASE_URL}/stock/social-sentiment",
            params={"symbol": symbol, "token": _key()},
            timeout=10,
        )
        if resp.status_code != 200:
            return {}
        data = resp.json()
        reddit = data.get("reddit", [])
        twitter = data.get("twitter", [])

        def avg_sentiment(items):
            if not items:
                return 0.0
            scores = [item.get("score", 0) for item in items]
            return sum(scores) / len(scores)

        return {
            "reddit_sentiment": avg_sentiment(reddit),
            "twitter_sentiment": avg_sentiment(twitter),
            "reddit_mentions": sum(item.get("mention", 0) for item in reddit),
            "twitter_mentions": sum(item.get("mention", 0) for item in twitter),
        }
    except Exception as e:
        print(f"[finnhub] Social sentiment error for {symbol}: {e}")
        return {}
