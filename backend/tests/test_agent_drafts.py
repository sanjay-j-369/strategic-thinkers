from app.agentic.workers.nodes import compose_operator_alert
from app.services.agent_email import postprocess_agent_email
from app.services.gtm_agent import execute_gtm_agent


def test_gtm_agent_replaces_skeleton_placeholders():
    result = execute_gtm_agent(
        "user-123",
        {
            "blocker_summary": "- Hiring pipeline is delayed.\n- Candidate follow-up is stale.",
            "draft_payload": {
                "channel": "email",
                "prompt": "Hiring Agent follow-up",
                "draft_text": "original body",
                "context_payload": {"draft_type": "WORKER_FOLLOW_UP"},
            },
        },
    )

    draft_text = result["draft_payload"]["draft_text"]
    assert "Vault Mode skeleton draft" not in draft_text
    assert "<UUID_CONTACT>" not in draft_text
    assert "<UUID_TOPIC>" not in draft_text
    assert "Hiring pipeline is delayed" in draft_text
    assert result["draft_payload"]["context_payload"]["delivery_mode"] == "vault_pending"


def test_agent_email_prefills_email_recipient_from_hint():
    draft = postprocess_agent_email(
        user_id="user-123",
        security_mode="vault",
        agent_name="Board Member",
        subject="Mentor weekly memo",
        body="Review the runway plan.",
        recipient_hint="alex@example.com",
    )

    assert draft["draft_text"] == "Review the runway plan."
    assert draft["context_payload"]["to_email"] == "alex@example.com"
    assert "<UUID_CONTACT>" not in draft["draft_text"]


def test_worker_draft_prefills_recipient_from_context_email():
    result = compose_operator_alert(
        {
            "user_id": "user-123",
            "user_email": "founder@example.com",
            "security_mode": "vault",
            "google_connected": True,
            "worker_key": "hiring-agent",
            "worker_name": "Hiring Agent",
            "lane": "hiring",
            "tags": ["hiring"],
            "config": {"monitor_targets": "#hiring"},
            "context_items": [
                {
                    "id": "trace-123",
                    "source": "gmail",
                    "text": "From: Marcus Rodriguez <marcus@example.com>\nCan we schedule a call?",
                }
            ],
            "blockers": ["Can we schedule a call?"],
            "blocker_summary": "- Candidate follow-up needs an owner.",
            "draft_payload": None,
            "notification": None,
        }
    )

    draft_payload = result["draft_payload"]
    assert result["notification"]["notification_type"] == "WORKER_FOLLOW_UP"
    assert result["notification"]["title"] == "Hiring Agent surfaced actions"
    assert draft_payload["prompt"] == "Hiring Agent follow-up"
    assert draft_payload["context_payload"]["to_email"] == "marcus@example.com"
    assert draft_payload["context_payload"]["recipient_hint"] == "Marcus Rodriguez"
