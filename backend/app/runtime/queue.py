from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import Session

from app.config import settings
from app.db import build_sync_engine
from app.models.task_queue import TaskQueue


TaskHandler = Callable[[FastAPI, dict], Awaitable[dict | None]]


@dataclass
class TaskLease:
    id: uuid.UUID
    task_name: str
    payload: dict
    attempts: int
    max_attempts: int


class PostgresTaskQueue:
    def __init__(self, session_factory: async_sessionmaker, *, max_attempts: int | None = None):
        self.session_factory = session_factory
        self.max_attempts = max_attempts or settings.POSTGRES_QUEUE_MAX_ATTEMPTS

    async def enqueue(
        self,
        task_name: str,
        payload: dict,
        *,
        priority: int = 5,
        available_at: datetime | None = None,
        max_attempts: int | None = None,
    ) -> str:
        async with self.session_factory() as session:
            task = TaskQueue(
                task_name=task_name,
                payload=payload,
                priority=priority,
                available_at=available_at or datetime.now(timezone.utc),
                max_attempts=max_attempts or self.max_attempts,
            )
            session.add(task)
            await session.commit()
            await session.refresh(task)
            return str(task.id)

    async def lease_ready_tasks(self, *, limit: int | None = None) -> list[TaskLease]:
        now = datetime.now(timezone.utc)
        batch_size = limit or settings.POSTGRES_QUEUE_BATCH_SIZE

        async with self.session_factory() as session:
            async with session.begin():
                stmt = (
                    select(TaskQueue)
                    .where(
                        TaskQueue.status == "PENDING",
                        TaskQueue.available_at <= now,
                    )
                    .order_by(TaskQueue.priority.asc(), TaskQueue.created_at.asc())
                    .with_for_update(skip_locked=True)
                    .limit(batch_size)
                )
                rows = list((await session.execute(stmt)).scalars().all())
                leases: list[TaskLease] = []
                for row in rows:
                    row.status = "RUNNING"
                    row.attempts += 1
                    row.locked_at = now
                    row.started_at = row.started_at or now
                    leases.append(
                        TaskLease(
                            id=row.id,
                            task_name=row.task_name,
                            payload=row.payload or {},
                            attempts=row.attempts,
                            max_attempts=row.max_attempts,
                        )
                    )
                return leases

    async def mark_succeeded(self, task_id: uuid.UUID, result_payload: dict | None = None) -> None:
        async with self.session_factory() as session:
            async with session.begin():
                task = await session.get(TaskQueue, task_id)
                if not task:
                    return
                task.status = "SUCCEEDED"
                task.result_payload = result_payload
                task.completed_at = datetime.now(timezone.utc)
                task.locked_at = None

    async def mark_failed(self, lease: TaskLease, exc: Exception) -> None:
        retry_at = datetime.now(timezone.utc) + timedelta(
            seconds=settings.POSTGRES_QUEUE_RETRY_DELAY_SECONDS * max(1, lease.attempts)
        )
        async with self.session_factory() as session:
            async with session.begin():
                task = await session.get(TaskQueue, lease.id)
                if not task:
                    return
                task.last_error = str(exc)
                task.locked_at = None
                if lease.attempts >= lease.max_attempts:
                    task.status = "FAILED"
                    task.completed_at = datetime.now(timezone.utc)
                else:
                    task.status = "PENDING"
                    task.available_at = retry_at


def enqueue_task_sync(
    task_name: str,
    payload: dict,
    *,
    priority: int = 5,
    available_at: datetime | None = None,
    max_attempts: int | None = None,
) -> str:
    engine = build_sync_engine()
    with Session(engine) as session:
        task = TaskQueue(
            task_name=task_name,
            payload=payload,
            priority=priority,
            available_at=available_at or datetime.now(timezone.utc),
            max_attempts=max_attempts or settings.POSTGRES_QUEUE_MAX_ATTEMPTS,
        )
        session.add(task)
        session.commit()
        session.refresh(task)
        return str(task.id)


class PostgresTaskRunner:
    def __init__(self, app: FastAPI, queue: PostgresTaskQueue, handlers: dict[str, TaskHandler]):
        self.app = app
        self.queue = queue
        self.handlers = handlers
        self._task: asyncio.Task | None = None
        self._stopping = asyncio.Event()

    async def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run_loop(), name="postgres-task-runner")

    async def stop(self) -> None:
        self._stopping.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run_loop(self) -> None:
        while not self._stopping.is_set():
            leases = await self.queue.lease_ready_tasks()
            if not leases:
                await asyncio.sleep(settings.POSTGRES_QUEUE_POLL_INTERVAL_SECONDS)
                continue

            for lease in leases:
                handler = self.handlers.get(lease.task_name)
                if handler is None:
                    await self.queue.mark_failed(lease, RuntimeError(f"No handler for {lease.task_name}"))
                    continue
                try:
                    result = await handler(self.app, lease.payload)
                    await self.queue.mark_succeeded(lease.id, result_payload=result)
                except Exception as exc:
                    await self.queue.mark_failed(lease, exc)
