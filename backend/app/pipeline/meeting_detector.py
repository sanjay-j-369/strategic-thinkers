"""
LLM-powered meeting detector.
Reads email/Slack content and extracts meeting details if present.
"""
import os
import json
from groq import Groq


def detect_meeting(content: str, source: str) -> dict | None:
    """
    Use Groq LLM to detect if content contains a meeting request.
    Returns meeting dict or None if no meeting found.
    """
    client = Groq(api_key=os.environ.get("GROQ_API_KEY", ""))

    prompt = f"""Analyze this {source} message and determine if it contains a meeting request or invite.

MESSAGE:
{content[:2000]}

If this message contains a meeting/call/sync request, respond with JSON:
{{
  "is_meeting": true,
  "topic": "meeting title or subject",
  "attendees": ["email1", "email2"],
  "meet_link": "https://meet.google.com/xxx or null",
  "scheduled_time": "time mentioned or null",
  "summary": "one line summary of the meeting purpose"
}}

If NO meeting is mentioned, respond with:
{{"is_meeting": false}}

Respond ONLY with valid JSON, nothing else."""

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=300,
        )
        text = response.choices[0].message.content.strip()
        # Extract JSON from response
        if "```" in text:
            text = text.split("```")[1].replace("json", "").strip()
        result = json.loads(text)
        if result.get("is_meeting"):
            return result
    except Exception as e:
        print(f"[MeetingDetector] Error: {e}")
    return None
