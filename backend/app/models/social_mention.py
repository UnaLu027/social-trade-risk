from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, Numeric, String, Text, Index, func
from app.database import Base

_BigPK = BigInteger().with_variant(Integer, "sqlite")


class SocialMention(Base):
    __tablename__ = "social_mentions"

    id = Column(_BigPK, primary_key=True, autoincrement=True)
    ticker_id = Column(Integer, ForeignKey("tickers.id"), nullable=False)
    ts = Column(DateTime(timezone=True), nullable=False)
    source = Column(String(20), default="reddit")
    post_id = Column(String(100), unique=True, nullable=False)
    body_snippet = Column(Text)
    author = Column(String(100))
    score = Column(Integer, default=0)
    sentiment_score = Column(Numeric(5, 4))
    is_bullish = Column(Boolean)
    url = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_mention_ticker_ts_desc", "ticker_id", "ts"),
    )
