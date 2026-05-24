"""
Detects trending stocks using yfinance market data (volume spikes, price moves, news activity).
Optionally boosts scores with Reddit PRAW and StockTwits data when credentials are configured.
"""
import re
import yfinance as yf
import pandas as pd

from app.data.tickers_universe import TICKER_UNIVERSE

SCAN_TICKERS = TICKER_UNIVERSE

# Pre-compile ticker pattern for mention extraction
_TICKER_RE = re.compile(r'\$([A-Z]{1,5})\b|(?<!\w)([A-Z]{2,5})(?!\w)')


def _extract_tickers_from_text(text: str) -> list[str]:
    """Extract potential ticker symbols from text."""
    found = set()
    for m in re.finditer(r'\$([A-Z]{1,5})\b', text):
        found.add(m.group(1))
    return list(found)


def _get_reddit_boost() -> dict[str, float]:
    """
    Fetch hot posts from Reddit PRAW and count ticker mentions.
    Returns a dict of symbol -> boost_score (0-20 range).
    Falls back to empty dict if PRAW not configured.
    """
    boosts: dict[str, float] = {}
    try:
        from app.services.reddit_praw_service import fetch_trending_posts
        posts = fetch_trending_posts(limit_per_sub=50)
        if not posts:
            return boosts
        ticker_set = set(SCAN_TICKERS)
        mention_counts: dict[str, int] = {}
        for post in posts:
            text = post.get("text", "").upper()
            tickers = _extract_tickers_from_text(text)
            score = post.get("score", 1)
            weight = min(score / 100, 5.0)  # cap weight per post
            for ticker in tickers:
                if ticker in ticker_set:
                    mention_counts[ticker] = mention_counts.get(ticker, 0) + 1
                    boosts[ticker] = boosts.get(ticker, 0.0) + weight
        # Normalize to 0-20 range
        if boosts:
            max_boost = max(boosts.values())
            if max_boost > 0:
                boosts = {k: (v / max_boost) * 20 for k, v in boosts.items()}
    except Exception as e:
        print(f"[trending] Reddit PRAW boost error: {e}")
    return boosts


def _get_finnhub_boost(symbols: list[str]) -> dict[str, float]:
    """
    Use Finnhub social sentiment (Reddit + Twitter mentions) to boost trending scores.
    Returns boost scores (0-20 range). Only runs for top candidates to stay within rate limits.
    Falls back to empty dict if FINNHUB_API_KEY not set.
    """
    boosts: dict[str, float] = {}
    try:
        from app.services.finnhub_service import get_social_sentiment
        # Only fetch top 20 candidates to avoid hitting 60 calls/min rate limit
        sample = symbols[:20]
        mention_totals: dict[str, int] = {}
        for sym in sample:
            data = get_social_sentiment(sym)
            if data:
                total = data.get("reddit_mentions", 0) + data.get("twitter_mentions", 0)
                if total > 0:
                    mention_totals[sym] = total
        if mention_totals:
            max_mentions = max(mention_totals.values())
            if max_mentions > 0:
                for sym, total in mention_totals.items():
                    boosts[sym] = (total / max_mentions) * 20
        if boosts:
            print(f"[trending] Finnhub social boost active for {len(boosts)} tickers")
    except Exception as e:
        print(f"[trending] Finnhub boost error: {e}")
    return boosts


async def get_trending_tickers(limit: int = 10) -> list[dict]:
    """
    Detect trending stocks using yfinance: volume spikes + price moves + news count.
    Optionally boosts with Reddit PRAW mentions and StockTwits watchlist counts.
    Returns top `limit` tickers ranked by a composite trending score.
    """
    results = []
    try:
        # Batch download 21 days of daily data for all tickers at once
        raw = yf.download(
            tickers=" ".join(SCAN_TICKERS),
            period="21d",
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
        for symbol in SCAN_TICKERS:
            try:
                if len(SCAN_TICKERS) == 1:
                    df = raw
                else:
                    df = raw[symbol] if symbol in raw.columns.get_level_values(0) else None
                if df is None or df.empty or len(df) < 5:
                    continue
                df = df.dropna(subset=["Close", "Volume"])
                if len(df) < 5:
                    continue
                last_vol = float(df["Volume"].iloc[-1])
                avg_vol = float(df["Volume"].iloc[-21:-1].mean()) if len(df) >= 21 else float(df["Volume"].mean())
                vol_spike = last_vol / max(avg_vol, 1)
                # Price change over last 5 days
                price_5d_ago = float(df["Close"].iloc[-5])
                price_now = float(df["Close"].iloc[-1])
                price_chg_pct = abs((price_now - price_5d_ago) / max(price_5d_ago, 0.01))
                # News count: prefer Finnhub (richer), fallback to yfinance
                try:
                    from app.services.finnhub_service import get_news as fh_get_news
                    fh_articles = fh_get_news(symbol, limit=10)
                    news_count = len(fh_articles) if fh_articles else len(yf.Ticker(symbol).news or [])
                except Exception:
                    try:
                        news_count = len(yf.Ticker(symbol).news or [])
                    except Exception:
                        news_count = 0
                # Composite trending score (0-100) from yfinance signals
                score = min(100, (
                    min(vol_spike, 5) / 5 * 40 +        # volume spike: up to 40 points
                    min(price_chg_pct, 0.3) / 0.3 * 40 + # price move: up to 40 points
                    min(news_count, 10) / 10 * 20         # news activity: up to 20 points
                ))
                # Sentiment from price direction
                sentiment = 0.3 if price_now > price_5d_ago else -0.3
                results.append({
                    "symbol": symbol,
                    "mention_count": round(score),
                    "avg_sentiment": round(sentiment, 4),
                    "subreddits_active": ["market_data"],
                    "vol_spike": round(vol_spike, 2),
                    "price_chg_5d_pct": round(price_chg_pct * 100, 2),
                    "_base_score": score,
                })
            except Exception:
                continue
    except Exception as e:
        print(f"[trending] yfinance batch download error: {e}")
        return []

    # Enrich with Reddit PRAW boosts (if API key configured)
    reddit_boosts = _get_reddit_boost()
    if reddit_boosts:
        print(f"[trending] Reddit PRAW boost active for {len(reddit_boosts)} tickers")

    # Enrich with Finnhub social sentiment (Reddit + Twitter mention counts)
    candidate_symbols = [r["symbol"] for r in results]
    fh_boosts = _get_finnhub_boost(candidate_symbols)

    # Apply boosts and update sources list
    for r in results:
        sym = r["symbol"]
        total_boost = reddit_boosts.get(sym, 0.0) + fh_boosts.get(sym, 0.0)
        r["mention_count"] = min(100, round(r["_base_score"] + total_boost))
        sources = ["market_data"]
        if sym in reddit_boosts:
            sources.append("reddit")
        if sym in fh_boosts:
            sources.append("finnhub")
        r["subreddits_active"] = sources
        del r["_base_score"]

    # Sort by mention_count (trending score) descending
    results.sort(key=lambda x: x["mention_count"], reverse=True)
    return results[:limit]
