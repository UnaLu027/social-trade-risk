from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, Numeric, SmallInteger, UniqueConstraint, Index
from sqlalchemy import JSON
from app.database import Base

_BigPK = BigInteger().with_variant(Integer, "sqlite")


class HypeScore(Base):
    __tablename__ = "hype_scores"

    id = Column(_BigPK, primary_key=True, autoincrement=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id"), nullable=False)
    ts = Column(DateTime(timezone=True), nullable=False)
    hype_score = Column(Numeric(5, 2))
    mention_count_1h = Column(Integer, default=0)
    mention_count_24h = Column(Integer, default=0)
    bullish_ratio = Column(Numeric(4, 3))
    avg_sentiment = Column(Numeric(5, 4))
    price_change_pct = Column(Numeric(7, 4))
    volume_spike = Column(Numeric(7, 4))
    ml_risk_label = Column(SmallInteger)
    ml_risk_prob = Column(Numeric(5, 4))
    top_drivers = Column(JSON)

    __table_args__ = (
        UniqueConstraint("ticker_id", "ts", name="uq_hype_ticker_ts"),
        Index("ix_hype_ticker_ts_desc", "ticker_id", "ts"),
    )
