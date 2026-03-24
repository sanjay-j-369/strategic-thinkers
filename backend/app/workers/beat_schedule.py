import os
from celery.schedules import crontab

_mode = os.getenv("INGESTION_MODE", "simulate")

CELERYBEAT_SCHEDULE = {
    "poll-calendar": {
        "task": "poll_calendar_events" if _mode == "real" else "poll_calendar_simulated",
        "schedule": crontab(minute="*/15"),
    },
}
