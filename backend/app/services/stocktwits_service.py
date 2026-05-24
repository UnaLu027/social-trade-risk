"""
StockTwits API service - free public API, no auth required for basic reads.
Optional: Set STOCKTWITS_ACCESS_TOKEN for higher rate limits.
"""
import os
import httpx
from app.services.sentiment_service import score_text

BASE_URL = "https://api.stocktwits.com/api/2"


def get_headers() -> dict:
    token = os.getenv("STOCKTWITS_ACCESS_TOKEN", "")
    if token:
        return {"Authorization": f"OAuth {token}"}
    return {}


def fetch_symbol_stream(symbol: str, limit: int = 30) -> list[dict]:
    """Fetch recent messages for a stock symbol from StockTwits."""
    try:
        resp = httpx.get(
            f"{BASE_URL}/streams/symbol/{symbol}.json",
            params={"limit": min(limit, 30)},
            headers=get_headers(),
            timeout=10,
        )
        if resp.status_code != 200:
            return []
        data = resp.json()
        messages = data.get("messages", [])
        results = []
        for msg in messages:
            body = msg.get("body", "")
            # StockTwits provides built-in sentiment labels
            st_sentiment = msg.get("entities", {}).get("sentiment", {})
            if st_sentiment and st_sentiment.get("basic"):
                basic = st_sentiment["basic"]
                sentiment = 0.5 if basic == "Bullish" else -0.5
                is_bullish = basic == "Bullish"
            else:
                sentiment = score_text(body)
                is_bullish = sentiment > 0.05
            results.append({
                "source": "stocktwits",
                "post_id": str(msg.get("id", "")),
                "body_snippet": body[:200],
                "author": msg.get("user", {}).get("username", "unknown"),
                "score": msg.get("likes", {}).get("total", 0),
                "sentiment_score": sentiment,
                "is_bullish": is_bullish,
                "url": f"https://stocktwits.com/symbol/{symbol}",
            })
        return results
    except Exception as e:
        print(f"[stocktwits] Error fetching {symbol}: {e}")
        return []


def get_symbol_sentiment_summary(symbol: str) -> dict:
    """Get bullish/bearish ratio from StockTwits trending data."""
    try:
        resp = httpx.get(
            f"{BASE_URL}/streams/symbol/{symbol}.json",
            params={"limit": 30},
            timeout=8,
        )
        if resp.status_code != 200:
            return {}
        data = resp.json()
        symbol_data = data.get("symbol", {})
        return {
            "watchlist_count": symbol_data.get("watchlist_count", 0),
        }
    except Exception:
        return {}
