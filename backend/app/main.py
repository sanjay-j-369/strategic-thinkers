import json
import asyncio
from contextlib import asynccontextmanager

import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.config import settings
from app.models.base import Base
from app.api.ws import manager
from app.api.routes import auth, summaries, guide, privacy, simulate, ingest, meetings, chat


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DB init
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255)"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_team_id VARCHAR(255)"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_channel_ids TEXT"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS google_last_synced_at TIMESTAMP WITH TIME ZONE"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_last_synced_at TIMESTAMP WITH TIME ZONE"
        )
        await conn.exec_driver_sql(
            "ALTER TABLE summaries ADD COLUMN IF NOT EXISTS source_ref VARCHAR(255)"
        )
    app.state.async_session = async_sessionmaker(engine, expire_on_commit=False)

    # Redis pub/sub listener
    redis_client = aioredis.from_url(settings.REDIS_URL)
    pubsub = redis_client.pubsub()
    await pubsub.psubscribe("founder:*")

    async def redis_listener():
        async for message in pubsub.listen():
            if message["type"] == "pmessage":
                channel = message["channel"]
                if isinstance(channel, bytes):
                    channel = channel.decode()
                # channel format: "founder:{user_id}"
                user_id = channel.split(":", 1)[-1]
                try:
                    data = json.loads(message["data"])
                    await manager.send_to_user(user_id, data)
                except Exception:
                    pass

    listener_task = asyncio.create_task(redis_listener())

    yield

    listener_task.cancel()
    await pubsub.close()
    await redis_client.aclose()
    await engine.dispose()


app = FastAPI(title="Founder Intelligence Engine", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(summaries.router)
app.include_router(guide.router)
app.include_router(privacy.router)
app.include_router(simulate.router)
app.include_router(ingest.router)
app.include_router(meetings.router)
app.include_router(chat.router)


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect(user_id, websocket)
    try:
        while True:
            # Keep connection alive; messages are pushed from Redis listener
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(user_id)


@app.get("/health")
async def health():
    return {"status": "ok"}
