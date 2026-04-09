from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, set[WebSocket]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(user_id, set()).add(websocket)

    def disconnect(self, user_id: str, websocket: WebSocket | None = None):
        if websocket is None:
            self.active_connections.pop(user_id, None)
            return
        connections = self.active_connections.get(user_id)
        if not connections:
            return
        connections.discard(websocket)
        if not connections:
            self.active_connections.pop(user_id, None)

    async def send_to_user(self, user_id: str, data: dict):
        sockets = list(self.active_connections.get(user_id, set()))
        for ws in sockets:
            try:
                await ws.send_json(data)
            except Exception:
                self.disconnect(user_id, ws)


manager = ConnectionManager()
