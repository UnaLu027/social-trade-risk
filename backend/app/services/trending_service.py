"""
Detects trending stocks using yfinance market data (volume spikes, price moves, news activity).
No external API dependency - fully self-contained.
"""
import yfinance as yf
import pandas as pd

SCAN_TICKERS = [
    "GME", "AMC", "TSLA", "NVDA", "AAPL", "MSFT", "META", "PLTR", "MSTR",
    "AMD", "COIN", "HOOD", "SOFI", "RIVN", "SPY", "QQQ", "AMZN", "GOOGL",
    "NFLX", "DIS", "SHOP", "SNAP", "UBER", "RBLX", "DKNG", "MARA", "RIOT",
    "BB", "NIO",
]

async def get_trending_tickers(limit: int = 10) -> list[dict]:
    """
    Detect trending stocks using yfinance: volume spikes + price moves + news count.
    Returns top `limit` tickers ranked by a composite trending score.
    """
    results = []
    try:
        # Batch download 5 days of daily data for all tickers at once
        raw = yf.download(
            tickers=" ".join(SCAN_TICKERS),
            period="21d",   # 21 days to compute 20-day avg volume
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
                # News count
                try:
                    news_count = len(yf.Ticker(symbol).news or [])
                except Exception:
                    news_count = 0
                # Composite trending score (0-100)
                score = min(100, (
                    min(vol_spike, 5) / 5 * 40 +       # volume spike: up to 40 points
                    min(price_chg_pct, 0.3) / 0.3 * 40 + # price move: up to 40 points
                    min(news_count, 10) / 10 * 20       # news activity: up to 20 points
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
                })
            except Exception:
                continue
    except Exception as e:
        print(f"[trending] yfinance batch download error: {e}")
        return []
    # Sort by mention_count (trending score) descending
    results.sort(key=lambda x: x["mention_count"], reverse=True)
    return results[:limit]
