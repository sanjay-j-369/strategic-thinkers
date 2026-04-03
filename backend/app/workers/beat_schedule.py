import os
from celery.schedules import crontab

_mode = os.getenv("INGESTION_MODE", "simulate")

CELERYBEAT_SCHEDULE = {
    "poll-calendar": {
        "task": "poll_calendar_events" if _mode == "real" else "poll_calendar_simulated",
        "schedule": crontab(minute="*/15"),
    },
    "evaluate-founder-thresholds": {
        "task": "evaluate_founder_thresholds",
        "schedule": crontab(minute=0, hour=6),
    },
}

if _mode == "real":
    CELERYBEAT_SCHEDULE["poll-gmail"] = {
        "task": "poll_gmail_real",
        "schedule": crontab(minute="*/10"),  # every 10 min
    }
    CELERYBEAT_SCHEDULE["poll-slack"] = {
        "task": "poll_slack_real",
        "schedule": crontab(minute="*/5"),   # every 5 min
    }
