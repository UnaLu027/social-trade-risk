from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models import Ticker, HypeScore, Alert


ALERT_RULES = {
    "hype_spike": {"severity": "critical", "threshold": 80},
    "hype_high": {"severity": "high", "threshold": 60},
    "volume_bomb": {"severity": "high", "threshold": 3.0},
    "mention_velocity": {"severity": "high", "threshold": 5.0},
    "model_warning": {"severity": "critical", "threshold": 0.70},
    "sentiment_flip": {"severity": "medium", "threshold": 0.3},
}


def _already_fired(db: Session, ticker_id: int, rule_name: str, within_hours: int = 4) -> bool:
    since = datetime.utcnow() - timedelta(hours=within_hours)
    return db.execute(
        select(Alert).where(
            Alert.ticker_id == ticker_id,
            Alert.rule_name == rule_name,
            Alert.ts >= since,
        )
    ).scalar_one_or_none() is not None


def _fire(db: Session, ticker_id: int, ticker_symbol: str, rule_name: str,
          severity: str, message: str, explanation: str, hype_score: float):
    alert = Alert(
        ticker_id=ticker_id,
        severity=severity,
        rule_name=rule_name,
        message=message,
        hype_score=hype_score,
        is_read=False,
        metadata_={"explanation": explanation},
    )
    db.add(alert)
    db.commit()


def evaluate_alerts(db: Session, ticker: Ticker, hype: HypeScore):
    symbol = ticker.symbol
    hs = float(hype.hype_score or 0)
    vs = float(hype.volume_spike or 1)
    mc1h = hype.mention_count_1h or 0
    mc_prev = max(hype.mention_count_1h or 1, 1)
    ml_prob = float(hype.ml_risk_prob or 0)

    # Hype spike critical
    if hs >= 80 and not _already_fired(db, ticker.id, "hype_spike"):
        _fire(db, ticker.id, symbol, "hype_spike", "critical",
              f"{symbol} hype score reached {hs:.0f}/100",
              f"Hype score at {hs:.0f} — above the 80-point squeeze risk threshold. "
              f"Mention count in the past hour: {mc1h}.",
              hs)

    # High hype
    elif hs >= 60 and not _already_fired(db, ticker.id, "hype_high"):
        _fire(db, ticker.id, symbol, "hype_high", "high",
              f"{symbol} hype score elevated: {hs:.0f}/100",
              f"Social and volume signals are above normal. Hype score: {hs:.0f}.",
              hs)

    # Volume bomb
    if vs >= 3.0 and not _already_fired(db, ticker.id, "volume_bomb"):
        _fire(db, ticker.id, symbol, "volume_bomb", "high",
              f"{symbol} volume spike {vs:.1f}× average",
              f"Current volume is {vs:.1f}× the 20-day average. This level of volume amplification is a precursor to short squeeze dynamics.",
              hs)

    # ML model warning
    if ml_prob >= 0.70 and hype.ml_risk_label == 2 and not _already_fired(db, ticker.id, "model_warning"):
        _fire(db, ticker.id, symbol, "model_warning", "critical",
              f"ML model: {symbol} high-risk probability {ml_prob*100:.0f}%",
              f"The stacked ensemble classifier assigns {ml_prob*100:.0f}% probability to the 'high risk' class based on current social and market features.",
              hs)
