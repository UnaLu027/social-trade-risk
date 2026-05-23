from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./dev.db"
    secret_key: str = "dev-secret-change-in-production"
    environment: str = "development"
    allowed_origins: str = "http://localhost:5173"

    reddit_fetch_enabled: bool = True
    reddit_base_url: str = "https://www.reddit.com"
    reddit_user_agent: str = "SocialTradeRisk/1.0"

    scheduler_enabled: bool = True
    price_sync_interval_minutes: int = 5
    reddit_sync_interval_minutes: int = 15
    hype_compute_interval_minutes: int = 15

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
