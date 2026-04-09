"""
Legacy Celery entrypoint kept as a compatibility stub during the APScheduler/Postgres queue migration.
New runtime orchestration now lives under `app.runtime.*`.
"""

celery_app = None
