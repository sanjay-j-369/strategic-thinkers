from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/founders_helper"
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX: str = "founders-helper"
    GROQ_API_KEY: str = ""
    MASTER_FERNET_KEY: str = ""
    INGESTION_MODE: str = "simulate"
    SIMULATOR_SPEED: str = "normal"
    DEMO_MODE: bool = False
    DEMO_USER_ID: str = "550e8400-e29b-41d4-a716-446655440000"
    SCHEDULER_TIMEZONE: str = "UTC"
    POSTGRES_QUEUE_POLL_INTERVAL_SECONDS: float = 2.0
    POSTGRES_QUEUE_BATCH_SIZE: int = 8
    POSTGRES_QUEUE_MAX_ATTEMPTS: int = 4
    POSTGRES_QUEUE_RETRY_DELAY_SECONDS: int = 30
    AI_WORKER_SWEEP_INTERVAL_HOURS: int = 4
    MORNING_BRIEFING_HOUR: int = 7
    PROMISE_TRACKER_HOUR: int = 8
    MENTOR_WEEKLY_DAY_OF_WEEK: str = "mon"
    MENTOR_WEEKLY_HOUR: int = 9
    APP_BASE_URL: str = "http://localhost:3001"
    EMAIL_FROM: str = "mentor@founderos.local"
    EMAIL_REPLY_TO: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    MENTOR_ALERT_MIN_IMPORTANCE: int = 75

    class Config:
        env_file = ".env"
        extra = "ignore"

    @property
    def database_sync_url(self) -> str:
        return self.DATABASE_URL.replace("+asyncpg", "")


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
