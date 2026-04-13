from __future__ import annotations

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI

from app.config import settings
from app.runtime.task_names import TaskNames
from app.services.worker_directory import list_catalog_items

_scheduler_app: FastAPI | None = None


def create_scheduler(app: FastAPI) -> AsyncIOScheduler:
    global _scheduler_app
    _scheduler_app = app
    jobstores = {
        "default": SQLAlchemyJobStore(
            url=settings.database_sync_url,
            tablename="scheduler_jobs",
        )
    }
    scheduler = AsyncIOScheduler(jobstores=jobstores, timezone=settings.SCHEDULER_TIMEZONE)
    _register_jobs(app, scheduler)
    return scheduler


def _register_jobs(app: FastAPI, scheduler: AsyncIOScheduler) -> None:
    for legacy_job_id in ("ai-worker-gtm", "ai-worker-cto", "ai-worker-dev"):
        if scheduler.get_job(legacy_job_id):
            scheduler.remove_job(legacy_job_id)

    for worker in list_catalog_items():
        scheduler.add_job(
            enqueue_named_task,
            trigger=CronTrigger(hour=f"*/{settings.AI_WORKER_SWEEP_INTERVAL_HOURS}"),
            kwargs={
                "task_name": TaskNames.AI_WORKER_SWEEP,
                "payload": {"worker_key": worker.key},
                "priority": 2,
            },
            id=f"ai-worker-{worker.key}",
            replace_existing=True,
        )

    scheduler.add_job(
        enqueue_named_task,
        trigger=CronTrigger(hour=settings.MORNING_BRIEFING_HOUR, minute=0),
        kwargs={
            "task_name": TaskNames.ASSISTANT_MORNING_BRIEFING,
            "payload": {},
            "priority": 1,
        },
        id="assistant-morning-briefing",
        replace_existing=True,
    )
    scheduler.add_job(
        enqueue_named_task,
        trigger=CronTrigger(hour=settings.PROMISE_TRACKER_HOUR, minute=0),
        kwargs={
            "task_name": TaskNames.ASSISTANT_PROMISE_DIGEST,
            "payload": {},
            "priority": 1,
        },
        id="assistant-promise-digest",
        replace_existing=True,
    )
    scheduler.add_job(
        enqueue_named_task,
        trigger=CronTrigger(
            day_of_week=settings.MENTOR_WEEKLY_DAY_OF_WEEK,
            hour=settings.MENTOR_WEEKLY_HOUR,
            minute=0,
        ),
        kwargs={
            "task_name": TaskNames.MENTOR_WEEKLY_REVIEW,
            "payload": {},
            "priority": 1,
        },
        id="mentor-weekly-review",
        replace_existing=True,
    )

    scheduler.add_job(
        enqueue_named_task,
        trigger=CronTrigger(minute="*/15"),
        kwargs={
            "task_name": TaskNames.SYSTEM_POLL_CALENDAR,
            "payload": {},
            "priority": 2,
        },
        id="poll-calendar",
        replace_existing=True,
    )
    scheduler.add_job(
        enqueue_named_task,
        trigger=CronTrigger(hour=6, minute=0),
        kwargs={
            "task_name": TaskNames.SYSTEM_THRESHOLD_SCAN,
            "payload": {},
            "priority": 1,
        },
        id="mentor-threshold-scan",
        replace_existing=True,
    )

    if settings.INGESTION_MODE == "real":
        scheduler.add_job(
            enqueue_named_task,
            trigger=CronTrigger(minute="*/10"),
            kwargs={
                "task_name": TaskNames.SYSTEM_POLL_GMAIL,
                "payload": {},
                "priority": 2,
            },
            id="poll-gmail-real",
            replace_existing=True,
        )
        scheduler.add_job(
            enqueue_named_task,
            trigger=CronTrigger(minute="*/10"),
            kwargs={
                "task_name": TaskNames.SYSTEM_POLL_SLACK,
                "payload": {},
                "priority": 2,
            },
            id="poll-slack-real",
            replace_existing=True,
        )


async def enqueue_named_task(task_name: str, payload: dict, priority: int) -> None:
    if _scheduler_app is None:
        return
    await _scheduler_app.state.task_queue.enqueue(task_name, payload, priority=priority)
