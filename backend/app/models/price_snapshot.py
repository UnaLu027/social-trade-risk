from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, Integer, Numeric, UniqueConstraint, Index
from app.database import Base

_BigPK = BigInteger().with_variant(Integer, "sqlite")


class PriceSnapshot(Base):
    __tablename__ = "price_snapshots"

    id = Column(_BigPK, primary_key=True, autoincrement=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id"), nullable=False)
    ts = Column(DateTime(timezone=True), nullable=False)
    open = Column(Numeric(12, 4))
    high = Column(Numeric(12, 4))
    low = Column(Numeric(12, 4))
    close = Column(Numeric(12, 4))
    volume = Column(BigInteger)

    __table_args__ = (
        UniqueConstraint("ticker_id", "ts", name="uq_price_ticker_ts"),
        Index("ix_price_ticker_ts_desc", "ticker_id", "ts"),
    )
