from __future__ import annotations

import asyncio
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, set[WebSocket]] = {}
        self.admin_connections: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect_user(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(user_id, set()).add(websocket)

    def disconnect_user(self, user_id: str, websocket: WebSocket | None = None):
        if websocket is None:
            self.active_connections.pop(user_id, None)
            return
        connections = self.active_connections.get(user_id)
        if not connections:
            return
        connections.discard(websocket)
        if not connections:
            self.active_connections.pop(user_id, None)

    async def connect_admin(self, websocket: WebSocket):
        await websocket.accept()
        self.admin_connections.add(websocket)

    def disconnect_admin(self, websocket: WebSocket | None = None):
        if websocket is None:
            self.admin_connections.clear()
            return
        self.admin_connections.discard(websocket)

    async def send_to_user(self, user_id: str, data: dict):
        sockets = list(self.active_connections.get(user_id, set()))
        for ws in sockets:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect_user(user_id, ws)

    async def send_to_admins(self, data: dict):
        sockets = list(self.admin_connections)
        for ws in sockets:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect_admin(ws)

    def emit_admin(self, data: dict) -> None:
        if self._loop is None or self._loop.is_closed():
            return
        asyncio.run_coroutine_threadsafe(self.send_to_admins(data), self._loop)


manager = ConnectionManager()
