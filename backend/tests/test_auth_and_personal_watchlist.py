"""
Tests for:
  - POST /api/v1/auth/register
  - POST /api/v1/auth/login
  - GET  /api/v1/auth/me
  - GET  /api/v1/me/watchlist
  - POST /api/v1/me/watchlist
  - DELETE /api/v1/me/watchlist/{symbol}

And scheduler helper:
  - _get_tracked_symbols (distinct active personal watchlist symbols)

Scenarios 1-8 as specified, plus extra edge cases.
"""

import uuid
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.database import Base, get_db
from app.main import app, _get_tracked_symbols
from app.models.alert import Watchlist  # legacy global watchlist model

# ── Isolated in-memory SQLite DB for these tests ─────────────────────────────

TEST_URL = "sqlite:///./test_auth.db"
_engine = create_engine(TEST_URL, connect_args={"check_same_thread": False})
_Session = sessionmaker(autocommit=False, autoflush=False, bind=_engine)


@pytest.fixture(scope="module", autouse=True)
def _create_tables():
    Base.metadata.create_all(bind=_engine)
    yield
    Base.metadata.drop_all(bind=_engine)
    _engine.dispose()


@pytest.fixture()
def db():
    session = _Session()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db):
    def override():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


# ── Helpers ───────────────────────────────────────────────────────────────────

def unique_email() -> str:
    return f"test-{uuid.uuid4().hex[:8]}@example.com"


def register_and_login(client, email: str | None = None, password: str = "Password123") -> str:
    """Register a user and return their access token."""
    email = email or unique_email()
    r = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.json()
    r2 = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r2.status_code == 200, r2.json()
    return r2.json()["access_token"], email


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Scenario 1: register → login → /auth/me ───────────────────────────────────

def test_register_login_me(client):
    email = unique_email()
    # Register
    r = client.post("/api/v1/auth/register", json={"email": email, "password": "Secure123"})
    assert r.status_code == 201
    data = r.json()
    assert data["email"] == email
    assert "password_hash" not in data

    # Login
    r2 = client.post("/api/v1/auth/login", json={"email": email, "password": "Secure123"})
    assert r2.status_code == 200
    token = r2.json()["access_token"]
    assert token

    # /me
    r3 = client.get("/api/v1/auth/me", headers=auth_header(token))
    assert r3.status_code == 200
    assert r3.json()["email"] == email


# ── Scenario 2: User A adds GME, GET shows GME ────────────────────────────────

def test_user_a_add_gme_visible(client):
    token_a, _ = register_and_login(client)
    headers = auth_header(token_a)

    r = client.post("/api/v1/me/watchlist", json={"symbol": "GME"}, headers=headers)
    assert r.status_code == 201
    assert r.json()["symbol"] == "GME"

    r2 = client.get("/api/v1/me/watchlist", headers=headers)
    assert r2.status_code == 200
    symbols = [i["symbol"] for i in r2.json()]
    assert "GME" in symbols


# ── Scenario 3: User B cannot see User A's GME ────────────────────────────────

def test_user_b_cannot_see_user_a_gme(client):
    token_a, _ = register_and_login(client)
    token_b, _ = register_and_login(client)

    # A adds GME
    client.post("/api/v1/me/watchlist", json={"symbol": "GME"}, headers=auth_header(token_a))

    # B's list should not contain GME
    r = client.get("/api/v1/me/watchlist", headers=auth_header(token_b))
    assert r.status_code == 200
    assert all(i["symbol"] != "GME" for i in r.json())


# ── Scenario 4: A + B both add GME → distinct tracked still 1 ─────────────────

def test_distinct_tracked_symbols_deduplication(client, db):
    token_a, _ = register_and_login(client)
    token_b, _ = register_and_login(client)

    client.post("/api/v1/me/watchlist", json={"symbol": "GME"}, headers=auth_header(token_a))
    client.post("/api/v1/me/watchlist", json={"symbol": "GME"}, headers=auth_header(token_b))

    tracked = _get_tracked_symbols(db)
    assert tracked.count("GME") == 1


# ── Scenario 5: A removes GME, B still active → GME stays in scheduler ────────

def test_gme_stays_tracked_when_b_active(client, db):
    token_a, _ = register_and_login(client)
    token_b, _ = register_and_login(client)

    client.post("/api/v1/me/watchlist", json={"symbol": "GME"}, headers=auth_header(token_a))
    client.post("/api/v1/me/watchlist", json={"symbol": "GME"}, headers=auth_header(token_b))

    # A removes GME
    r = client.delete("/api/v1/me/watchlist/GME", headers=auth_header(token_a))
    assert r.status_code == 200

    # B still active → GME must remain in scheduler symbols
    tracked = _get_tracked_symbols(db)
    assert "GME" in tracked


# ── Scenario 6: Both remove → symbol no longer in scheduler ──────────────────
# Uses a unique symbol ("ZTESTONLY") not touched by any other test, so that
# _get_tracked_symbols reflects only these two users' state.

_SYM6 = "ZTESTONLY"


def test_symbol_leaves_tracked_when_all_removed(client, db):
    token_a, _ = register_and_login(client)
    token_b, _ = register_and_login(client)

    client.post("/api/v1/me/watchlist", json={"symbol": _SYM6}, headers=auth_header(token_a))
    client.post("/api/v1/me/watchlist", json={"symbol": _SYM6}, headers=auth_header(token_b))

    # Verify it's tracked before removal
    assert _SYM6 in _get_tracked_symbols(db)

    client.delete(f"/api/v1/me/watchlist/{_SYM6}", headers=auth_header(token_a))
    client.delete(f"/api/v1/me/watchlist/{_SYM6}", headers=auth_header(token_b))

    # Both users removed → symbol must be gone from active tracked set
    assert _SYM6 not in _get_tracked_symbols(db)


# ── Scenario 7: no token → 401 ────────────────────────────────────────────────

def test_no_token_rejected(client):
    r = client.get("/api/v1/me/watchlist")
    assert r.status_code == 401

    r2 = client.post("/api/v1/me/watchlist", json={"symbol": "GME"})
    assert r2.status_code == 401


# ── Scenario 8: 21st symbol rejected ─────────────────────────────────────────

def test_watchlist_limit_20(client):
    token, _ = register_and_login(client)
    headers = auth_header(token)

    us_symbols = [
        "AAPL","MSFT","GOOGL","AMZN","META","NVDA","TSLA","AMD","INTC","QCOM",
        "AVGO","TXN","MU","AMAT","KLAC","LRCX","MRVL","NXPI","ON","ADI",
    ]
    for sym in us_symbols:
        r = client.post("/api/v1/me/watchlist", json={"symbol": sym}, headers=headers)
        assert r.status_code == 201, f"Failed adding {sym}: {r.json()}"

    # 21st should be rejected
    r = client.post("/api/v1/me/watchlist", json={"symbol": "GME"}, headers=headers)
    assert r.status_code == 400
    assert "full" in r.json()["detail"].lower()


# ── Extra: duplicate symbol returns 409 ──────────────────────────────────────

def test_duplicate_symbol_rejected(client):
    token, _ = register_and_login(client)
    headers = auth_header(token)
    client.post("/api/v1/me/watchlist", json={"symbol": "AAPL"}, headers=headers)
    r = client.post("/api/v1/me/watchlist", json={"symbol": "AAPL"}, headers=headers)
    assert r.status_code == 409


# ── Extra: removed symbol can be re-added (soft-delete reactivation) ──────────

def test_soft_delete_reactivation(client, db):
    token, _ = register_and_login(client)
    headers = auth_header(token)

    client.post("/api/v1/me/watchlist", json={"symbol": "GME"}, headers=headers)
    client.delete("/api/v1/me/watchlist/GME", headers=headers)

    # Verify removed
    r = client.get("/api/v1/me/watchlist", headers=headers)
    assert all(i["symbol"] != "GME" for i in r.json())

    # Re-add → should succeed (reactivation)
    r2 = client.post("/api/v1/me/watchlist", json={"symbol": "GME"}, headers=headers)
    assert r2.status_code == 201
    assert r2.json()["symbol"] == "GME"


# ── Extra: Taiwan stocks rejected ────────────────────────────────────────────

def test_taiwan_stocks_rejected(client):
    token, _ = register_and_login(client)
    headers = auth_header(token)
    r = client.post("/api/v1/me/watchlist", json={"symbol": "2330.TW"}, headers=headers)
    assert r.status_code == 400


# ── Legacy Watchlist UNION tests ─────────────────────────────────────────────
# Verifies _get_tracked_symbols includes both legacy global watchlist symbols
# AND personal user watchlist symbols, with deduplication across both sources.

_LEGACY_SYM   = "ZLEGACY"    # in legacy Watchlist only  (7 chars, passes validation)
_PERSONAL_SYM = "ZPERSONAL"  # in personal watchlist only (9 chars, passes validation)
_SHARED_SYM   = "ZSHARED"    # in both sources            (7 chars, passes validation)


def _add_legacy(db, symbol: str) -> None:
    """Insert a symbol into the global Watchlist table directly."""
    # Check for duplicates first (the legacy model has symbol UNIQUE)
    existing = db.query(Watchlist).filter(Watchlist.symbol == symbol).first()
    if not existing:
        db.add(Watchlist(symbol=symbol))
        db.commit()


def test_legacy_symbol_included_in_tracked(client, db):
    """A symbol in the legacy global Watchlist must appear in tracked symbols."""
    _add_legacy(db, _LEGACY_SYM)
    tracked = _get_tracked_symbols(db)
    assert _LEGACY_SYM in tracked


def test_personal_symbol_included_in_tracked(client, db):
    """A symbol added via personal watchlist API must appear in tracked symbols."""
    token, _ = register_and_login(client)
    client.post("/api/v1/me/watchlist", json={"symbol": _PERSONAL_SYM}, headers=auth_header(token))
    tracked = _get_tracked_symbols(db)
    assert _PERSONAL_SYM in tracked


def test_shared_symbol_appears_only_once(client, db):
    """A symbol present in both legacy and personal watchlists appears exactly once."""
    _add_legacy(db, _SHARED_SYM)
    token_a, _ = register_and_login(client)
    token_b, _ = register_and_login(client)
    client.post("/api/v1/me/watchlist", json={"symbol": _SHARED_SYM}, headers=auth_header(token_a))
    client.post("/api/v1/me/watchlist", json={"symbol": _SHARED_SYM}, headers=auth_header(token_b))
    tracked = _get_tracked_symbols(db)
    assert tracked.count(_SHARED_SYM) == 1


# ── Password length validation tests ─────────────────────────────────────────

def test_password_too_short_rejected(client):
    """Password shorter than 8 characters must be rejected with 400."""
    r = client.post("/api/v1/auth/register", json={"email": unique_email(), "password": "Ab1234"})
    assert r.status_code == 400
    assert "8" in r.json()["detail"]


def test_password_too_long_rejected(client):
    """Password longer than 128 characters must be rejected with 400."""
    r = client.post("/api/v1/auth/register", json={"email": unique_email(), "password": "A" * 129})
    assert r.status_code == 400
    assert "128" in r.json()["detail"]


# ── _compute_hype filtering tests ────────────────────────────────────────────
# Verifies _compute_hype only processes Ticker rows whose symbols are in
# _get_tracked_symbols (legacy Watchlist UNION active UserWatchlistItem).
# External APIs are fully mocked — no network calls are made.

_HYPE_TRACKED_SYM   = "ZTRKED"   # added to legacy Watchlist → tracked
_HYPE_UNTRACKED_SYM = "ZNOTRK"   # NOT in any watchlist → not tracked


def test_compute_hype_only_processes_tracked_symbols(db):
    """_compute_hype must skip Tickers whose symbols are not in _get_tracked_symbols."""
    from app.models import Ticker
    import app.main as main_module
    from unittest.mock import patch

    _add_legacy(db, _HYPE_TRACKED_SYM)

    for sym in (_HYPE_TRACKED_SYM, _HYPE_UNTRACKED_SYM):
        if not db.query(Ticker).filter(Ticker.symbol == sym).first():
            db.add(Ticker(symbol=sym, is_active=True))
    db.commit()

    processed: list[str] = []

    class _SessionProxy:
        """Wraps the test session; swallows close() to keep fixture session alive."""
        def close(self):
            pass
        def __getattr__(self, name):
            return getattr(db, name)

    with patch("app.main.SessionLocal", return_value=_SessionProxy()), \
         patch("app.services.hype_calculator.compute_and_store_hype",
               side_effect=lambda _db, ticker: processed.append(ticker.symbol) or None), \
         patch("app.services.alert_engine.evaluate_alerts"):
        main_module._compute_hype()

    assert _HYPE_TRACKED_SYM in processed
    assert _HYPE_UNTRACKED_SYM not in processed


# ── Extra: invalid email rejected at register ────────────────────────────────

def test_invalid_email_rejected(client):
    r = client.post("/api/v1/auth/register", json={"email": "notanemail", "password": "Secret123"})
    assert r.status_code == 400


# ── Extra: duplicate email rejected at register ───────────────────────────────

def test_duplicate_email_rejected(client):
    email = unique_email()
    client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123"})
    r = client.post("/api/v1/auth/register", json={"email": email, "password": "Secret123"})
    assert r.status_code == 409


# ── Extra: wrong password rejected ───────────────────────────────────────────

def test_wrong_password_rejected(client):
    email = unique_email()
    client.post("/api/v1/auth/register", json={"email": email, "password": "Correct123"})
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "Wrong123"})
    assert r.status_code == 401
