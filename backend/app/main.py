from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.config import get_settings
from app.database import engine, SessionLocal
from app.models import Base, Ticker, Watchlist
from app.ml import inference
from app.ml.fakenews import inference_fakenews
from app.routers import market_pulse, event_replay, alerts, scenario, screener, fake_news

settings = get_settings()
_scheduler = BackgroundScheduler()


def _sync_prices():
    db: Session = SessionLocal()
    try:
        symbols = [w.symbol for w in db.execute(select(Watchlist)).scalars().all()]
        from app.services import yfinance_service as yf_svc
        for sym in symbols:
            inserted = yf_svc.fetch_and_store_prices(db, sym, period="1d", interval="5m")
            if inserted:
                print(f"[scheduler] prices: +{inserted} rows for {sym}")
    except Exception as e:
        print(f"[scheduler] price sync error: {e}")
    finally:
        db.close()


def _sync_reddit():
    db: Session = SessionLocal()
    try:
        symbols = [w.symbol for w in db.execute(select(Watchlist)).scalars().all()]
        from app.services import reddit_service, sentiment_service, yfinance_service as yf_svc
        for sym in symbols:
            ticker = db.execute(select(Ticker).where(Ticker.symbol == sym)).scalar_one_or_none()
            if not ticker:
                yf_svc._get_or_create_ticker(db, sym)
                ticker = db.execute(select(Ticker).where(Ticker.symbol == sym)).scalar_one_or_none()
            if not ticker:
                continue
            posts = reddit_service.fetch_reddit_posts_multi(
                sym, limit=100, subreddits=["wallstreetbets", "stocks", "StockMarket"]
            )
            inserted = reddit_service.store_mentions(db, ticker.id, posts, sentiment_service.score_text)
            if inserted:
                print(f"[scheduler] reddit: +{inserted} mentions for {sym}")
    except Exception as e:
        print(f"[scheduler] reddit sync error: {e}")
    finally:
        db.close()


def _compute_hype():
    db: Session = SessionLocal()
    try:
        tickers = db.execute(select(Ticker).where(Ticker.is_active == True)).scalars().all()
        from app.services import hype_calculator, alert_engine
        for ticker in tickers:
            hype = hype_calculator.compute_and_store_hype(db, ticker)
            if hype:
                alert_engine.evaluate_alerts(db, ticker, hype)
                print(f"[scheduler] hype: {ticker.symbol} = {hype.hype_score}")
    except Exception as e:
        print(f"[scheduler] hype compute error: {e}")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables (idempotent; Alembic handles production)
    Base.metadata.create_all(bind=engine)

    # Load ML model
    inference.load_model()

    # Load fake news model (auto-trains if not found)
    inference_fakenews.load_fakenews_model()

    # Start background scheduler
    if settings.scheduler_enabled:
        _scheduler.add_job(_sync_prices, "interval",
                           minutes=settings.price_sync_interval_minutes, id="sync_prices")
        _scheduler.add_job(_sync_reddit, "interval",
                           minutes=settings.reddit_sync_interval_minutes, id="sync_reddit")
        _scheduler.add_job(_compute_hype, "interval",
                           minutes=settings.hype_compute_interval_minutes, id="compute_hype")
        _scheduler.start()
        print("[scheduler] Started")

    yield

    if _scheduler.running:
        _scheduler.shutdown(wait=False)
        print("[scheduler] Stopped")


app = FastAPI(
    title="Social Trading Intelligence Platform",
    description="GameStop-style social-driven trading risk analysis API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market_pulse.router)
app.include_router(event_replay.router)
app.include_router(alerts.router)
app.include_router(scenario.router)
app.include_router(screener.router)
app.include_router(fake_news.router)


@app.get("/health")
def health():
    from app.ml.inference import get_metadata
    meta = get_metadata()
    return {
        "status": "ok",
        "model_accuracy": meta.get("accuracy"),
        "model_f1": meta.get("f1_weighted"),
        "trained_at": meta.get("trained_at"),
    }


@app.get("/api/v1/model-info")
def model_info():
    from app.ml.inference import get_metadata
    return get_metadata()
