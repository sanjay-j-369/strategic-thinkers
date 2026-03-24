import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "founders_helper",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.workers.consumer", "app.ingestion.calendar", "app.ingestion.simulator.calendar_sim"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_queue_max_priority=10,
    task_default_priority=5,
    broker_transport_options={"priority_steps": list(range(10))},
)
