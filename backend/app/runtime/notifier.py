from __future__ import annotations

from typing import Protocol

from app.api.ws import ConnectionManager


class NotificationBus(Protocol):
    async def publish_to_user(self, user_id: str, payload: dict) -> None: ...

    async def start(self) -> None: ...

    async def stop(self) -> None: ...


class InMemoryNotificationBus:
    """
    Single-instance notifier used in the current deployment mode.
    A future Postgres LISTEN/NOTIFY implementation can match this interface.
    """

    def __init__(self, manager: ConnectionManager):
        self.manager = manager

    async def start(self) -> None:
        return None

    async def stop(self) -> None:
        return None

    async def publish_to_user(self, user_id: str, payload: dict) -> None:
        await self.manager.send_to_user(user_id, payload)


class PostgresNotificationBus(InMemoryNotificationBus):
    """
    Placeholder adapter for a future multi-instance LISTEN/NOTIFY fan-out layer.
    The interface is intentionally identical to `InMemoryNotificationBus`.
    """

    pass
