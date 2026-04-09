import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.ws import manager
from app.api import demo as demo_api
from app.api.routes import auth, summaries, guide, privacy, simulate, ingest, meetings, chat, ops
from app.config import settings
from app.db import build_async_engine, build_session_factory, init_database
from app.runtime.notifier import InMemoryNotificationBus
from app.runtime.queue import PostgresTaskQueue, PostgresTaskRunner
from app.runtime.scheduler import create_scheduler
from app.runtime.task_handlers import get_task_handlers


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = build_async_engine()
    await init_database(engine)
    manager.bind_loop(asyncio.get_running_loop())
    app.state.async_session = build_session_factory(engine)
    app.state.task_queue = PostgresTaskQueue(app.state.async_session)
    app.state.notification_bus = InMemoryNotificationBus(manager)
    app.state.task_runner = PostgresTaskRunner(app, app.state.task_queue, get_task_handlers())
    app.state.scheduler = create_scheduler(app)

    if settings.DEMO_MODE:
        try:
            from app.demo.persona import ensure_demo_persona

            ensure_demo_persona(reset=False)
        except Exception as exc:
            print(f"[Demo] Persona bootstrap failed: {exc}")

    await app.state.notification_bus.start()
    await app.state.task_runner.start()
    app.state.scheduler.start()

    yield

    app.state.scheduler.shutdown(wait=False)
    await app.state.task_runner.stop()
    await app.state.notification_bus.stop()
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
app.include_router(demo_api.router)
app.include_router(ops.router)


@app.websocket("/ws/admin/logs")
async def admin_logs_websocket(websocket: WebSocket):
    if not settings.DEMO_MODE:
        await websocket.close(code=4403, reason="Demo mode is disabled")
        return
    await manager.connect_admin(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_admin(websocket)


@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    await manager.connect_user(user_id, websocket)
    try:
        while True:
            # Keep connection alive; messages are pushed from Redis listener
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect_user(user_id, websocket)


@app.get("/health")
async def health():
    return {"status": "ok"}
