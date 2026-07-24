from app.routers import (  # noqa: F401
    alerts,
    copilot,
    event_replay,
    financial_verification,
    market_pulse,
    scenario,
    screener,
)

# app.main already includes copilot.router.  Mount the financial MVP router under
# that existing aggregate router so the feature can be deployed without changing
# the production entrypoint or the legacy route registration order.
copilot.router.include_router(financial_verification.router)
