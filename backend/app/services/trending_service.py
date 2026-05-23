"""
Scrapes multiple Reddit subreddits to detect trending stock tickers.
No API key needed - uses Reddit's public JSON endpoint.
"""
import re
import asyncio
from collections import defaultdict

import httpx

from app.services.sentiment_service import score_text

SUBREDDITS = ["wallstreetbets", "stocks", "options", "StockMarket"]

KNOWN_TICKERS = {
    "GME", "AMC", "BBBY", "TSLA", "NVDA", "AAPL", "MSFT", "META", "GOOGL",
    "AMZN", "PLTR", "MSTR", "AMD", "INTC", "COIN", "RIVN", "NIO", "SPY",
    "QQQ", "TQQQ", "ARKK", "BB", "NOK", "HOOD", "RBLX", "SOFI", "MARA",
    "RIOT", "SHOP", "SNAP", "UBER", "LYFT", "NFLX", "DIS", "BABA", "JD",
    "DKNG", "PENN", "LCID", "WISH",
}

# Words to exclude that match ticker patterns but are common English words
_STOPWORDS = {
    "A", "I", "AM", "AN", "AS", "AT", "BE", "BY", "DO", "GO", "IF", "IN",
    "IS", "IT", "ME", "MY", "NO", "OF", "ON", "OR", "SO", "TO", "UP", "US",
    "WE", "FOR", "ARE", "BUT", "CAN", "DID", "GET", "GOT", "HAS", "HAD",
    "HIM", "HIS", "HOW", "ITS", "LET", "MAY", "NEW", "NOT", "NOW", "OFF",
    "OLD", "ONE", "OUR", "OUT", "OWN", "PUT", "SAY", "SHE", "THE", "TWO",
    "USE", "WAS", "WAY", "WHO", "WHY", "WILL", "WITH", "YES", "YET", "YOU",
    "ALL", "AND", "ANY", "ETF", "GDP", "IPO", "CEO", "CFO", "CTO", "ATH",
    "ATL", "FYI", "TBH", "IMO", "EOD", "AMA", "EPS", "PEG", "PE", "EV",
    "DD", "TA", "OI", "IV", "OP", "RH", "YOLO", "LOL",
}

_HEADERS = {"User-Agent": "SocialTradeRisk/1.0"}


def _extract_tickers(title: str, selftext: str) -> list[str]:
    """Extract ticker symbols from post title and body."""
    combined = (title + " " + selftext).upper()

    # $TICKER pattern
    dollar_tickers = re.findall(r'\$([A-Z]{2,5})\b', combined)

    # Known tickers appearing standalone (word boundary)
    known_found = []
    for ticker in KNOWN_TICKERS:
        pattern = r'\b' + re.escape(ticker) + r'\b'
        if re.search(pattern, combined):
            known_found.append(ticker)

    all_tickers = set(dollar_tickers) | set(known_found)
    # Filter out stopwords
    return [t for t in all_tickers if t not in _STOPWORDS]


async def _fetch_subreddit(client: httpx.AsyncClient, subreddit: str) -> list[dict]:
    """Fetch hot posts from a subreddit's public JSON endpoint."""
    url = f"https://www.reddit.com/r/{subreddit}/hot.json?limit=100"
    try:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
        return [item["data"] for item in data.get("data", {}).get("children", [])]
    except Exception as e:
        print(f"[trending] Failed to fetch r/{subreddit}: {e}")
        return []


async def get_trending_tickers(limit: int = 10) -> list[dict]:
    """
    Scrape multiple Reddit subreddits to find trending stock tickers.
    Returns top `limit` tickers ranked by mention count with sentiment.
    """
    ticker_mentions: dict[str, int] = defaultdict(int)
    ticker_sentiments: dict[str, list[float]] = defaultdict(list)
    ticker_subreddits: dict[str, set[str]] = defaultdict(set)

    try:
        async with httpx.AsyncClient(timeout=10, headers=_HEADERS) as client:
            tasks = [_fetch_subreddit(client, sub) for sub in SUBREDDITS]
            results = await asyncio.gather(*tasks, return_exceptions=True)

        for subreddit, posts in zip(SUBREDDITS, results):
            if isinstance(posts, Exception) or not isinstance(posts, list):
                continue
            for post in posts:
                title = post.get("title", "")
                selftext = post.get("selftext", "")
                tickers = _extract_tickers(title, selftext)
                if not tickers:
                    continue
                # Compute sentiment once per post
                text = (title + " " + selftext).strip()[:500]
                sentiment = score_text(text)
                for ticker in tickers:
                    ticker_mentions[ticker] += 1
                    ticker_sentiments[ticker].append(sentiment)
                    ticker_subreddits[ticker].add(subreddit)
    except Exception as e:
        print(f"[trending] Error during scraping: {e}")
        return []

    # Build ranked results
    ranked = sorted(ticker_mentions.items(), key=lambda x: x[1], reverse=True)[:limit]

    return [
        {
            "symbol": symbol,
            "mention_count": count,
            "avg_sentiment": round(
                sum(ticker_sentiments[symbol]) / len(ticker_sentiments[symbol]), 4
            ) if ticker_sentiments[symbol] else 0.0,
            "subreddits_active": sorted(ticker_subreddits[symbol]),
        }
        for symbol, count in ranked
    ]
