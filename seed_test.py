import requests
import json
import uuid
import datetime

user_id = "550e8400-e29b-41d4-a716-446655440000"

event = {
    "metadata": {
        "user_id": user_id,
        "trace_id": str(uuid.uuid4()),
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    },
    "task_type": "DATA_INGESTION",
    "payload": {
        "source": "GMAIL",
        "content_raw": "My personal phone number is 415-555-0198 and email is test@example.com",
        "content_redacted": "",
        "context_tags": ["test"],
        "entities": [],
        "topic": "test snippet"
    }
}

r = requests.post("http://localhost:8001/api/simulate/webhook", json=event)
print(r.json())
