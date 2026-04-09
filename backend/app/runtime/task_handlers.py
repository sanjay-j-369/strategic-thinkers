from __future__ import annotations

import asyncio

from fastapi import FastAPI

from app.agentic.assistant.service import run_assistant_cycle
from app.agentic.context import list_user_ids
from app.agentic.mentor.service import run_mentor_review
from app.agentic.persistence import finish_agent_run, save_drafts, save_notification, save_promise_items, start_agent_run
from app.agentic.workers.service import run_worker_lane
from app.runtime.founder_processing import process_founder_event_sync
from app.runtime.task_names import TaskNames


async def founder_event_handler(app: FastAPI, payload: dict) -> dict:
    result = await asyncio.to_thread(process_founder_event_sync, payload["event"])
    await _publish_notifications(app, payload["event"]["metadata"]["user_id"], result.get("notifications", []))
    return result


async def ai_worker_handler(app: FastAPI, payload: dict) -> dict:
    lane = payload.get("lane", "dev")
    published = 0
    for user_id in payload.get("user_ids") or list_user_ids():
        run_id = start_agent_run(
            user_id=user_id,
            pillar="WORKER",
            agent_name=f"{lane.upper()} Worker",
            trigger_type=payload.get("trigger_type", "scheduled"),
            input_payload=payload,
        )
        try:
            result = await asyncio.to_thread(run_worker_lane, lane=lane, user_id=user_id)
            notifications = []
            if result.get("notification"):
                notifications.append(
                    save_notification(
                        user_id=user_id,
                        pillar="WORKER",
                        agent_name=f"{lane.upper()} Worker",
                        notification_type=result["notification"]["notification_type"],
                        severity=result["notification"]["severity"],
                        title=result["notification"]["title"],
                        body=result["notification"]["body"],
                        payload=result["notification"].get("payload"),
                    )
                )
            finish_agent_run(run_id, status="SUCCEEDED", output_payload=result)
            await _publish_notifications(app, user_id, notifications)
            published += len(notifications)
        except Exception as exc:
            finish_agent_run(run_id, status="FAILED", error_text=str(exc))
            raise
    return {"published": published}


async def assistant_cycle_handler(app: FastAPI, payload: dict, *, mode: str) -> dict:
    published = 0
    for user_id in payload.get("user_ids") or list_user_ids():
        run_id = start_agent_run(
            user_id=user_id,
            pillar="ASSISTANT",
            agent_name="Chief of Staff",
            trigger_type=payload.get("trigger_type", "scheduled"),
            input_payload={"mode": mode, **payload},
        )
        try:
            result = await asyncio.to_thread(run_assistant_cycle, user_id=user_id, mode=mode)
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
        run_id = start_agent_run(
            user_id=user_id,
            pillar="MENTOR",
            agent_name="Board Member",
            trigger_type=payload.get("trigger_type", "scheduled"),
            input_payload=payload,
        )
        try:
            result = await asyncio.to_thread(run_mentor_review, user_id=user_id)
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
            output_payload = {
                **result,
                "metrics": {
                    "mrr_usd": result.get("profile", {}).get("mrr_usd"),
                    "burn_rate_usd": result.get("profile", {}).get("burn_rate_usd"),
                    "runway_months": result.get("profile", {}).get("runway_months"),
                },
            }
            finish_agent_run(run_id, status="SUCCEEDED", output_payload=output_payload)
            await _publish_notifications(app, user_id, notifications)
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
