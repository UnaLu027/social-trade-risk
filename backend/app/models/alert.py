from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, func, JSON
from app.database import Base

_BigPK = BigInteger().with_variant(Integer, "sqlite")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(_BigPK, primary_key=True, autoincrement=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id"), nullable=False)
    ts = Column(DateTime(timezone=True), server_default=func.now())
    severity = Column(String(10), nullable=False)
    rule_name = Column(String(50), nullable=False)
    message = Column(Text)
    hype_score = Column(Numeric(5, 2))
    is_read = Column(Boolean, default=False)
    metadata_ = Column("metadata", JSON)


class Watchlist(Base):
    __tablename__ = "watchlist"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(10), unique=True, nullable=False)
    added_at = Column(DateTime(timezone=True), server_default=func.now())
