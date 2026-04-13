from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.config import settings


SEVERITY_SCORES = {
    "info": 25,
    "warning": 70,
    "critical": 100,
}


def mentor_notification_importance(notification: dict) -> int:
    explicit = notification.get("importance_score")
    if isinstance(explicit, (int, float)):
        return int(explicit)
    return SEVERITY_SCORES.get(str(notification.get("severity", "")).lower(), 0)


def should_email_mentor_notification(notification: dict) -> bool:
    severity = str(notification.get("severity", "")).lower()
    importance = mentor_notification_importance(notification)
    return severity == "critical" or importance >= settings.MENTOR_ALERT_MIN_IMPORTANCE


def render_mentor_alert_email(*, title: str, body: str, dashboard_url: str) -> str:
    safe_title = _escape_html(title)
    safe_body = "<br />".join(_escape_html(line) for line in body.splitlines() if line.strip()) or _escape_html(body)
    safe_dashboard_url = _escape_html(dashboard_url)
    return f"""\
<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;background:#ffffff;color:#000000;font-family:Inter, 'Public Sans', Arial, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#ffffff;">
      <tr>
        <td style="padding:40px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:0 auto;border:1px solid #d4d4d4;border-collapse:collapse;">
            <tr>
              <td style="padding:28px 28px 20px 28px;border-bottom:1px solid #d4d4d4;">
                <div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#6b6b6b;">Founder OS</div>
                <div style="margin-top:12px;font-size:44px;line-height:1;font-weight:800;letter-spacing:-0.06em;text-transform:uppercase;">Mentor Alert</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#6b6b6b;">Signal</div>
                <div style="margin-top:10px;font-size:24px;line-height:1.15;font-weight:700;letter-spacing:-0.04em;">{safe_title}</div>
                <div style="margin-top:18px;font-size:16px;line-height:1.7;color:#111111;">{safe_body}</div>
                <div style="margin-top:28px;">
                  <a href="{safe_dashboard_url}" style="display:inline-block;background:#000000;border:1px solid #000000;color:#ffffff;padding:14px 18px;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">Open Founder Control Room</a>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


def send_transactional_email(*, to_email: str, subject: str, html: str) -> bool:
    if not settings.SMTP_HOST:
        print(f"[Email] Skipping send to {to_email}: SMTP_HOST is not configured.")
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.EMAIL_FROM
    message["To"] = to_email
    if settings.EMAIL_REPLY_TO:
        message["Reply-To"] = settings.EMAIL_REPLY_TO
    message.set_content("Open Founder OS to review the latest mentor alert.")
    message.add_alternative(html, subtype="html")

    if settings.SMTP_USE_SSL:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as smtp:
            _send_message(smtp, message)
            return True

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as smtp:
        if settings.SMTP_USE_TLS:
            smtp.starttls()
        _send_message(smtp, message)
        return True


def _send_message(smtp: smtplib.SMTP, message: EmailMessage) -> None:
    if settings.SMTP_USERNAME:
        smtp.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
    smtp.send_message(message)


def _escape_html(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
