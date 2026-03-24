from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/founders_helper"
    REDIS_URL: str = "redis://localhost:6379/0"
    PINECONE_API_KEY: str = ""
    PINECONE_INDEX: str = "founders-helper"
    GROQ_API_KEY: str = ""
    MASTER_FERNET_KEY: str = ""
    INGESTION_MODE: str = "simulate"
    SIMULATOR_SPEED: str = "normal"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
