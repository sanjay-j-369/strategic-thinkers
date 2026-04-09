from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models.base import Base
import app.models  # noqa: F401


COMPATIBILITY_DDL = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_team_id VARCHAR(255)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_channel_ids TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_last_synced_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_last_synced_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE summaries ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255)",
    "ALTER TABLE archive ADD COLUMN IF NOT EXISTS content_redacted TEXT",
    "ALTER TABLE archive ADD COLUMN IF NOT EXISTS pii_tokens JSONB",
]


def build_async_engine() -> AsyncEngine:
    return create_async_engine(settings.DATABASE_URL, echo=False)


def build_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


def build_sync_engine():
    return create_engine(settings.database_sync_url)


async def init_database(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for statement in COMPATIBILITY_DDL:
            await conn.exec_driver_sql(statement)
