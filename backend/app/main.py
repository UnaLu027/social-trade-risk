from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.config import get_settings
from app.database import engine, SessionLocal
from app.models import Base, Ticker, Watchlist
from app.models.user import UserWatchlistItem
from app.ml import inference
from app.ml.fakenews import inference_fakenews
from app.routers import market_pulse, event_replay, alerts, scenario, screener, fake_news, model_insights, copilot
from app.routers import auth as auth_router, me_watchlist as me_watchlist_router

settings = get_settings()
_scheduler = BackgroundScheduler()


def _get_tracked_symbols(db: Session) -> list[str]:
    """
    Returns DISTINCT symbols that the scheduler should refresh — the union of:
      1. Global Watchlist symbols (legacy; kept so existing /api/v1/watchlist routes
         still receive scheduled price / hype data during the transition period).
      2. Active personal UserWatchlistItem symbols (any active user's tracked symbols).
    Symbols that appear in both sources or in multiple users' lists are deduplicated.
    Returns an empty list only when both sources have no entries.
    """
    from sqlalchemy import union
    global_q = select(Watchlist.symbol)
    personal_q = (
        select(UserWatchlistItem.symbol)
        .where(UserWatchlistItem.is_active == True)
    )
    combined = union(global_q, personal_q).subquery()
    rows = db.execute(select(combined.c.symbol)).scalars().all()
    return list(rows)


def _sync_prices():
    """
    Fetch latest OHLCV data for every personally-tracked symbol (any active user).
    Cascade: 1-day/5-min (intraday) → 5-day/1-hour (after-hours / weekends) → 1-month/1-day.
    Taiwan stocks (.TW) skip the 5-min interval (not available via yfinance).
    """
    db: Session = SessionLocal()
    try:
        symbols = _get_tracked_symbols(db)
        from app.services import yfinance_service as yf_svc
        for sym in symbols:
            is_tw = sym.endswith(".TW")
            inserted = 0
            if not is_tw:
                inserted = yf_svc.fetch_and_store_prices(db, sym, period="1d", interval="5m")
            if not inserted:
                inserted = yf_svc.fetch_and_store_prices(db, sym, period="5d", interval="1h")
            if not inserted:
                inserted = yf_svc.fetch_and_store_prices(db, sym, period="1mo", interval="1d")
            print(f"[scheduler] prices: +{inserted} rows for {sym}")
    except Exception as e:
        print(f"[scheduler] price sync error: {e}")
    finally:
        db.close()


def _sync_reddit():
    db: Session = SessionLocal()
    try:
        symbols = _get_tracked_symbols(db)
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
        tracked_symbols = set(_get_tracked_symbols(db))
        if not tracked_symbols:
            return
        tickers = db.execute(
            select(Ticker).where(Ticker.is_active == True, Ticker.symbol.in_(tracked_symbols))
        ).scalars().all()
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

    # Load Colab text model (non-fatal if files are absent)
    try:
        from app.ml import text_inference as _text_inf
        _text_inf.load_text_model()
    except Exception as _e:
        print(f"[startup] Colab text model not loaded: {_e}")

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
    allow_origin_regex=r"https://.*\.github\.io",   # allow any GitHub Pages domain
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
app.include_router(model_insights.router)
app.include_router(copilot.router)
app.include_router(auth_router.router)
app.include_router(me_watchlist_router.router)


@app.get("/health")
def health():
    from app.ml.inference import get_metadata
    meta = get_metadata()
    return {
        "status": "ok",
        # best_model fields
        "model_name":    meta.get("best_model_name", "StackingClassifier"),
        "model_accuracy":meta.get("test_accuracy", meta.get("accuracy")),
        "model_f1":      meta.get("test_weighted_f1", meta.get("f1_weighted")),
        "macro_f1":      meta.get("test_macro_f1"),
        "trained_at":    meta.get("trained_at"),
    }


@app.get("/api/v1/version")
def version():
    """
    Deployment diagnostic: shows which git commit is running on Railway.
    Visit <railway-url>/api/v1/version to confirm the live code matches main.
    """
    import os
    return {
        "app_version":  app.version,
        "git_commit":   os.getenv("RAILWAY_GIT_COMMIT_SHA", "local-dev"),
        "git_branch":   os.getenv("RAILWAY_GIT_BRANCH", "local-dev"),
        "environment":  os.getenv("ENVIRONMENT", "development"),
    }


@app.get("/api/v1/debug/routes")
def debug_routes():
    """
    Returns all registered FastAPI route paths.
    Use this to confirm /api/v1/screener is present in the live deployment.
    """
    from fastapi.routing import APIRoute
    paths = sorted(
        {r.path for r in app.routes if isinstance(r, APIRoute)}
    )
    return {"route_count": len(paths), "routes": paths}


@app.get("/api/v1/model-info")
def model_info():
    from app.ml.inference import get_metadata
    return get_metadata()


@app.get("/api/v1/debug/watchlist")
def debug_watchlist():
    """
    Diagnostic: check Watchlist size and DB row counts.
    Use this to confirm whether Watchlist has too many entries causing Screener timeout.
    """
    from sqlalchemy import text as sa_text
    from app.database import SessionLocal
    from app.models import Watchlist as WL

    out: dict = {
        "watchlist_count": 0,
        "symbols": [],
        "ticker_count": 0,
        "price_snapshot_count": 0,
        "hype_score_count": 0,
        "errors": [],
    }

    db2 = SessionLocal()
    try:
        rows = db2.execute(select(WL)).scalars().all()
        out["watchlist_count"] = len(rows)
        out["symbols"] = [r.symbol for r in rows]
    except Exception as e:
        out["errors"].append(f"watchlist: {e}")

    for table, key in [
        ("tickers", "ticker_count"),
        ("price_snapshots", "price_snapshot_count"),
        ("hype_scores", "hype_score_count"),
    ]:
        try:
            cnt = db2.execute(sa_text(f"SELECT COUNT(*) FROM {table}")).scalar()
            out[key] = cnt or 0
        except Exception as e:
            out["errors"].append(f"{table}: {e}")

    db2.close()
    return out


@app.get("/api/v1/debug/data-sources")
def debug_data_sources():
    """
    Diagnostic endpoint — check which data sources are reachable.
    Visit <railway-url>/api/v1/debug/data-sources to see live status.
    """
    import os
    from app.database import SessionLocal
    from sqlalchemy import text, select as sa_select
    from app.models import PriceSnapshot, Ticker
    from app.services import yfinance_service as yf_svc
    from app.services import finnhub_service as fh_svc

    result: dict = {}

    # 1. Database connectivity + row counts
    try:
        db = SessionLocal()
        row = db.execute(text("SELECT COUNT(*) FROM price_snapshots")).scalar()
        tickers_count = db.execute(text("SELECT COUNT(*) FROM tickers")).scalar()
        # Latest price snapshot
        latest = db.execute(
            sa_select(PriceSnapshot).order_by(PriceSnapshot.ts.desc()).limit(1)
        ).scalar_one_or_none()
        result["db"] = {
            "status": "ok",
            "price_snapshot_rows": row,
            "tickers": tickers_count,
            "latest_price_ts": str(latest.ts) if latest else None,
        }
        db.close()
    except Exception as e:
        result["db"] = {"status": "error", "detail": str(e)}

    # 2. yfinance live price check (GME)
    try:
        p = yf_svc.get_live_price("GME")
        result["yfinance"] = {"status": "ok", "gme_price": p["close"] if p else None}
    except Exception as e:
        result["yfinance"] = {"status": "error", "detail": str(e)}

    # 3. Finnhub
    fh_key = os.getenv("FINNHUB_API_KEY", "")
    if fh_key:
        try:
            q = fh_svc.get_quote("GME")
            result["finnhub"] = {"status": "ok", "gme_price": q["price"] if q else None}
        except Exception as e:
            result["finnhub"] = {"status": "error", "detail": str(e)}
    else:
        result["finnhub"] = {"status": "no_key"}

    # 4. Reddit public API
    try:
        import httpx
        resp = httpx.get(
            "https://www.reddit.com/r/wallstreetbets/search.json",
            params={"q": "GME", "limit": 1, "sort": "new"},
            headers={"User-Agent": "SocialTradeRisk/1.0"},
            timeout=8,
        )
        result["reddit"] = {"status": "ok" if resp.status_code == 200 else "http_error",
                            "http_status": resp.status_code}
    except Exception as e:
        result["reddit"] = {"status": "error", "detail": str(e)}

    # 5. CORS / env
    result["env"] = {
        "allowed_origins": os.getenv("ALLOWED_ORIGINS", "(not set — default localhost)"),
        "environment": os.getenv("ENVIRONMENT", "development"),
        "finnhub_key_set": bool(fh_key),
    }

    return result
