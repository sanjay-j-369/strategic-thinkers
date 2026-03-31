from app.pipeline.pii import strip_pii
from app.ingestion.simulator.fixtures import FAKE_EMAILS

for email in FAKE_EMAILS:
    text = f"Subject: {email['subject']}\nFrom: {email['from']}\n\n{email['body']}"
    redacted, _ = strip_pii(text, "d4c615b8-cedc-4c97-80ed-2c8373610d78")
    print("---")
    print(redacted)
