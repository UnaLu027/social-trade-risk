from sqlalchemy import Boolean, Column, Integer, String, DateTime, func
from app.database import Base


class Ticker(Base):
    __tablename__ = "tickers"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(10), unique=True, nullable=False, index=True)
    name = Column(String(100))
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
