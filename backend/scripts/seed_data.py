"""
Seeds the database with:
- Default watchlist tickers (GME, AMC, BBBY)
- Real yfinance price history
- Simulated GME 2021 squeeze event social mentions
- Pre-built hype scores and alerts for demo day

Run: python scripts/seed_data.py
"""
import os
import sys
import random
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal, engine
from app.models import Base, Ticker, Watchlist, SocialMention, HypeScore, Alert

Base.metadata.create_all(bind=engine)

from app.services import yfinance_service as yf_svc

TICKERS = [
    ("GME", "GameStop Corp."),
    ("AMC", "AMC Entertainment Holdings"),
    ("BBBY", "Bed Bath & Beyond"),
]

GME_EVENTS_2021 = [
    ("2021-01-11", 12, 0.65, 0.38, 1.2, 1.1, 28.2),
    ("2021-01-13", 18, 0.68, 0.40, 1.4, 1.3, 31.4),
    ("2021-01-14", 22, 0.70, 0.42, 1.5, 1.5, 39.4),
    ("2021-01-19", 45, 0.72, 0.50, 1.8, 2.1, 43.0),
    ("2021-01-21", 89, 0.74, 0.60, 2.1, 3.2, 65.0),
    ("2021-01-22", 210, 0.78, 0.62, 2.8, 5.1, 65.0),
    ("2021-01-25", 540, 0.82, 0.72, 4.2, 8.3, 76.8),
    ("2021-01-26", 1200, 0.86, 0.80, 5.8, 12.1, 147.98),
    ("2021-01-27", 8900, 0.91, 0.88, 7.3, 18.4, 347.51),
    ("2021-01-28", 6200, 0.55, 0.45, 4.1, 9.2, 193.60),
    ("2021-02-01", 1800, 0.60, 0.50, 2.5, 4.2, 225.0),
    ("2021-02-08", 420, 0.65, 0.55, 1.8, 2.1, 72.41),
]

SAMPLE_POSTS_HIGH = [
    ("GME TO THE MOON! This is the mother of all short squeezes! HOLD THE LINE!",
     "u/RoaringKittyFan", 45230),
    ("Short interest still at 140%. They haven't covered. We hold.",
     "u/WallStreetApe", 32100),
    ("Citadel is hemorrhaging billions. This is historic.", "u/DiamondHandsOnly", 28900),
    ("Buy and HODL. Don't let them shake you out with FUD.", "u/RetailRevolution", 21500),
    ("The gamma squeeze is real. Watch the options chain.", "u/OptionsWizard", 18700),
]

SAMPLE_POSTS_MED = [
    ("GME looking interesting here. Volume picking up.", "u/SwingTrader99", 2300),
    ("Short interest still elevated. Worth watching.", "u/ValueInvestor", 1800),
    ("Institutional buying yesterday. Could be something.", "u/DD_Writer", 1200),
]


def seed():
    db = SessionLocal()
    try:
        # Seed tickers
        for symbol, name in TICKERS:
            existing = db.execute(
                __import__("sqlalchemy").select(Ticker).where(Ticker.symbol == symbol)
            ).scalar_one_or_none()
            if not existing:
                db.add(Ticker(symbol=symbol, name=name, is_active=True))
        db.commit()
        print("Tickers seeded.")

        # Seed watchlist
        for symbol, _ in TICKERS:
            existing = db.execute(
                __import__("sqlalchemy").select(Watchlist).where(Watchlist.symbol == symbol)
            ).scalar_one_or_none()
            if not existing:
                db.add(Watchlist(symbol=symbol))
        db.commit()
        print("Watchlist seeded.")

        # Fetch real price data
        for symbol, _ in TICKERS:
            n = yf_svc.fetch_and_store_prices(db, symbol, period="2y", interval="1d")
            print(f"Price history: {symbol} +{n} rows")

        # Seed GME 2021 simulated social + hype data
        from sqlalchemy import select as sa_select
        gme_ticker = db.execute(sa_select(Ticker).where(Ticker.symbol == "GME")).scalar_one_or_none()
        if gme_ticker:
            rng = random.Random(42)
            for date_str, mc1h, br, sentiment, vs, mg, price in GME_EVENTS_2021:
                ts = datetime.strptime(date_str, "%Y-%m-%d")
                mc24h = mc1h * rng.randint(15, 25)
                hype = float(
                    0.30 * min(mg / 5, 1)
                    + 0.20 * br
                    + 0.20 * min(vs / 5, 1)
                    + 0.15 * min((sentiment + 1) / 2, 1)
                    + 0.10 * 0.5
                    + 0.05 * 0.5
                ) * 100

                posts = SAMPLE_POSTS_HIGH if hype > 65 else SAMPLE_POSTS_MED
                for i, (text, author, score) in enumerate(posts):
                    post_id = f"reddit_gme_seed_{date_str}_{i}"
                    existing = db.execute(
                        sa_select(SocialMention).where(SocialMention.post_id == post_id)
                    ).scalar_one_or_none()
                    if not existing:
                        db.add(SocialMention(
                            ticker_id=gme_ticker.id,
                            ts=ts + timedelta(hours=rng.randint(8, 18)),
                            source="reddit",
                            post_id=post_id,
                            body_snippet=text,
                            author=author,
                            score=score,
                            sentiment_score=round(sentiment, 4),
                            is_bullish=sentiment > 0.1,
                            url=f"https://reddit.com/r/wallstreetbets/comments/seed{i}",
                        ))

                label = 2 if hype > 75 else (1 if hype > 40 else 0)
                existing_hs = db.execute(
                    sa_select(HypeScore).where(
                        HypeScore.ticker_id == gme_ticker.id,
                        HypeScore.ts == ts,
                    )
                ).scalar_one_or_none()
                if not existing_hs:
                    db.add(HypeScore(
                        ticker_id=gme_ticker.id,
                        ts=ts,
                        hype_score=round(hype, 2),
                        mention_count_1h=mc1h,
                        mention_count_24h=mc24h,
                        bullish_ratio=round(br, 3),
                        avg_sentiment=round(sentiment, 4),
                        price_change_pct=0.0,
                        volume_spike=round(vs, 2),
                        ml_risk_label=label,
                        ml_risk_prob=round(0.5 + hype / 200, 4),
                        top_drivers=["Mention Spike", "Short Squeeze Risk", "Bullish Surge"]
                        if hype > 65 else ["Volume Surge", "Positive Sentiment"],
                    ))

            db.commit()
            print("GME 2021 event data seeded.")

        # Seed demo alerts
        from sqlalchemy import select as sa_select2
        gme_ticker = db.execute(sa_select2(Ticker).where(Ticker.symbol == "GME")).scalar_one_or_none()
        if gme_ticker:
            db.add(Alert(
                ticker_id=gme_ticker.id,
                severity="critical",
                rule_name="hype_spike",
                message="GME hype score reached 91/100 — 2nd highest reading in 2 years",
                hype_score=91.0,
                is_read=False,
                metadata_={"explanation": "Mentions grew 7,300% above baseline on Jan 27. ML model assigns 94% high-risk probability."},
            ))
            db.add(Alert(
                ticker_id=gme_ticker.id,
                severity="critical",
                rule_name="model_warning",
                message="ML model: GME high-risk probability 94%",
                hype_score=91.0,
                is_read=False,
                metadata_={"explanation": "The stacked ensemble classifier assigns 94% probability to the 'high risk' class based on Jan 27 social and market features."},
            ))
            db.add(Alert(
                ticker_id=gme_ticker.id,
                severity="high",
                rule_name="volume_bomb",
                message="GME volume spike 18.4× average",
                hype_score=76.0,
                is_read=False,
                metadata_={"explanation": "Current volume is 18.4× the 20-day average. This level of volume amplification is a precursor to short squeeze dynamics."},
            ))
            db.commit()
            print("Demo alerts seeded.")

        print("\nSeed complete. Ready for demo!")

    except Exception as e:
        db.rollback()
        print(f"Seed error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
