from __future__ import annotations

import asyncio
import uuid

from fastapi import FastAPI
from sqlalchemy import select

from app.agentic.assistant.service import run_assistant_cycle
from app.agentic.context import list_user_ids
from app.agentic.mentor.service import run_mentor_review
from app.agentic.persistence import finish_agent_run, save_drafts, save_notification, save_promise_items, start_agent_run
from app.agentic.workers.service import run_worker_agent
from app.config import settings
from app.models.user import User
from app.services.agent_email import postprocess_agent_email
from app.services.email import render_mentor_alert_email, send_transactional_email, should_email_mentor_notification
from app.services.gtm_agent import execute_gtm_agent
from app.services.security_mode import load_user_security_context
from app.services.worker_directory import get_catalog_item, list_hired_user_ids_for_worker, load_hired_worker_runtime
from app.observability import emit_demo_log_async
from app.runtime.founder_processing import process_founder_event_sync
from app.runtime.task_names import TaskNames


async def founder_event_handler(app: FastAPI, payload: dict) -> dict:
    await emit_demo_log_async(
        user_id=payload["event"]["metadata"]["user_id"],
        message="[Task Runner] Founder event dequeued for processing.",
        pillar="SYSTEM",
        agent_name="Task Runner",
        event_type="pipeline_log",
        step="dequeued",
    )
    result = await asyncio.to_thread(process_founder_event_sync, payload["event"])
    await _publish_notifications(app, payload["event"]["metadata"]["user_id"], result.get("notifications", []))
    return result


async def ai_worker_handler(app: FastAPI, payload: dict) -> dict:
    worker_key = payload.get("worker_key")
    worker_item = get_catalog_item(worker_key) if worker_key else None
    if not worker_key or not worker_item:
        return {"published": 0, "worker_key": worker_key, "status": "skipped"}
    published = 0
    user_ids = payload.get("user_ids") or list_hired_user_ids_for_worker(worker_key)
    for user_id in user_ids:
        worker_runtime = load_hired_worker_runtime(user_id, worker_key)
        if not worker_runtime:
            continue
        run_id = start_agent_run(
            user_id=user_id,
            pillar="WORKER",
            agent_name=worker_item.name,
            trigger_type=payload.get("trigger_type", "scheduled"),
            input_payload={**payload, "worker_key": worker_key},
        )
        try:
            result = await asyncio.to_thread(
                run_worker_agent,
                worker_key=worker_key,
                user_id=user_id,
                config=worker_runtime.get("config"),
            )
            result["config"] = worker_runtime.get("config", {})
            result = await asyncio.to_thread(execute_gtm_agent, user_id, result)
            notifications = []
            if result.get("notification"):
                notifications.append(
                    save_notification(
                        user_id=user_id,
                        pillar="WORKER",
                        agent_name=worker_item.name,
                        notification_type=result["notification"]["notification_type"],
                        severity=result["notification"]["severity"],
                        title=result["notification"]["title"],
                        body=result["notification"]["body"],
                        payload=result["notification"].get("payload"),
                    )
                )
            if result.get("draft_payload"):
                save_drafts(user_id, [result["draft_payload"]])
            finish_agent_run(run_id, status="SUCCEEDED", output_payload=result)
            await _publish_notifications(app, user_id, notifications)
            published += len(notifications)
        except Exception as exc:
            finish_agent_run(run_id, status="FAILED", error_text=str(exc))
            raise
    return {"published": published, "worker_key": worker_key}


async def assistant_cycle_handler(app: FastAPI, payload: dict, *, mode: str) -> dict:
    published = 0
    for user_id in payload.get("user_ids") or list_user_ids():
        security = load_user_security_context(user_id)
        run_id = start_agent_run(
            user_id=user_id,
            pillar="ASSISTANT",
            agent_name="Chief of Staff",
            trigger_type=payload.get("trigger_type", "scheduled"),
            input_payload={"mode": mode, **payload},
        )
        try:
            result = await asyncio.to_thread(run_assistant_cycle, user_id=user_id, mode=mode)
            postprocessed_drafts = []
            for draft in result.get("drafts", []):
                context_payload = draft.get("context_payload") or {}
                if context_payload.get("draft_type") == "CONTEXT_ROUTING":
                    postprocessed_drafts.append(
                        postprocess_agent_email(
                            user_id=user_id,
                            security_mode=security["security_mode"],
                            agent_name="Chief of Staff",
                            subject=draft.get("prompt", "Context routing update"),
                            body=draft.get("draft_text", ""),
                            recipient_hint=context_payload.get("stakeholder", "Stakeholder"),
                            send_transactional=False,
                        )
                    )
                else:
                    postprocessed_drafts.append(draft)
            result["drafts"] = postprocessed_drafts
            save_promise_items(user_id, result.get("promises", []))
            save_drafts(user_id, result.get("drafts", []))
            notifications = [
                save_notification(
                    user_id=user_id,
                    pillar="ASSISTANT",
                    agent_name="Chief of Staff",
                    notification_type=notification["notification_type"],
                    severity=notification["severity"],
                    title=notification["title"],
                    body=notification["body"],
                    payload=notification.get("payload"),
                )
                for notification in result.get("notifications", [])
            ]
            finish_agent_run(run_id, status="SUCCEEDED", output_payload=result)
            await _publish_notifications(app, user_id, notifications)
            published += len(notifications)
        except Exception as exc:
            finish_agent_run(run_id, status="FAILED", error_text=str(exc))
            raise
    return {"published": published, "mode": mode}


async def mentor_handler(app: FastAPI, payload: dict) -> dict:
    published = 0
    for user_id in payload.get("user_ids") or list_user_ids():
        security = load_user_security_context(user_id)
        run_id = start_agent_run(
            user_id=user_id,
            pillar="MENTOR",
            agent_name="Board Member",
            trigger_type=payload.get("trigger_type", "scheduled"),
            input_payload=payload,
        )
        try:
            result = await asyncio.to_thread(run_mentor_review, user_id=user_id)
            mentor_draft = postprocess_agent_email(
                user_id=user_id,
                security_mode=security["security_mode"],
                agent_name="Board Member",
                subject="Mentor weekly memo",
                body=result.get("memo", "No critical strategic alerts."),
                recipient_hint=security["email"],
                send_transactional=False,
            )
            notifications = [
                save_notification(
                    user_id=user_id,
                    pillar="MENTOR",
                    agent_name="Board Member",
                    notification_type=notification["notification_type"],
                    severity=notification["severity"],
                    title=notification["title"],
                    body=notification["body"],
                    payload=notification.get("payload"),
                )
                for notification in result.get("notifications", [])
            ]
            save_drafts(user_id, [mentor_draft])
            output_payload = {
                **result,
                "drafts": [mentor_draft],
                "metrics": {
                    "mrr_usd": result.get("profile", {}).get("mrr_usd"),
                    "burn_rate_usd": result.get("profile", {}).get("burn_rate_usd"),
                    "runway_months": result.get("profile", {}).get("runway_months"),
                },
            }
            finish_agent_run(run_id, status="SUCCEEDED", output_payload=output_payload)
            await _publish_notifications(app, user_id, notifications)
            await _email_mentor_notifications(app, user_id, notifications)
            published += len(notifications)
        except Exception as exc:
            finish_agent_run(run_id, status="FAILED", error_text=str(exc))
            raise
    return {"published": published}


async def system_poll_gmail_handler(app: FastAPI, payload: dict) -> dict:
    from app.workers.real_ingestion import poll_gmail_real

    return await asyncio.to_thread(poll_gmail_real)


async def system_poll_slack_handler(app: FastAPI, payload: dict) -> dict:
    from app.workers.real_ingestion import poll_slack_real

    return await asyncio.to_thread(poll_slack_real)


async def system_poll_calendar_handler(app: FastAPI, payload: dict) -> dict:
    from app.ingestion.calendar import poll_calendar_events

    return await asyncio.to_thread(poll_calendar_events)


async def system_threshold_handler(app: FastAPI, payload: dict) -> dict:
    from app.workers.thresholds import evaluate_founder_thresholds

    return await asyncio.to_thread(evaluate_founder_thresholds, payload.get("user_id"))


async def _publish_notifications(app: FastAPI, user_id: str, notifications: list[dict]) -> None:
    for notification in notifications:
        await app.state.notification_bus.publish_to_user(user_id, notification)


async def _email_mentor_notifications(app: FastAPI, user_id: str, notifications: list[dict]) -> None:
    if not notifications:
        return

    email_notifications = [item for item in notifications if should_email_mentor_notification(item)]
    if not email_notifications:
        return

    async_session = app.state.async_session
    async with async_session() as session:
        user = (
            await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
        ).scalar_one_or_none()
    if not user or not user.email:
        return

    dashboard_url = settings.APP_BASE_URL.rstrip("/") or "http://localhost:3001"
    for notification in email_notifications:
        html = render_mentor_alert_email(
            title=notification.get("title", "Mentor Alert"),
            body=notification.get("body", ""),
            dashboard_url=dashboard_url,
        )
        await asyncio.to_thread(
            send_transactional_email,
            to_email=user.email,
            subject=f"Mentor Alert: {notification.get('title', 'High-priority update')}",
            html=html,
        )


def get_task_handlers():
    return {
        TaskNames.FOUNDER_EVENT: founder_event_handler,
        TaskNames.AI_WORKER_SWEEP: ai_worker_handler,
        TaskNames.ASSISTANT_MORNING_BRIEFING: lambda app, payload: assistant_cycle_handler(app, payload, mode="morning_briefing"),
        TaskNames.ASSISTANT_PROMISE_DIGEST: lambda app, payload: assistant_cycle_handler(app, payload, mode="promise_digest"),
        TaskNames.ASSISTANT_AUTO_DRAFT: lambda app, payload: assistant_cycle_handler(app, payload, mode="ingestion_watch"),
        TaskNames.MENTOR_WEEKLY_REVIEW: mentor_handler,
        TaskNames.SYSTEM_POLL_GMAIL: system_poll_gmail_handler,
        TaskNames.SYSTEM_POLL_SLACK: system_poll_slack_handler,
        TaskNames.SYSTEM_POLL_CALENDAR: system_poll_calendar_handler,
        TaskNames.SYSTEM_THRESHOLD_SCAN: system_threshold_handler,
    }
