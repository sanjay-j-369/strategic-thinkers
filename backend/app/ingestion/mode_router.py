import os

INGESTION_MODE = os.getenv("INGESTION_MODE", "simulate")


def get_gmail_worker():
    if INGESTION_MODE == "real":
        from .gmail import GmailWorker
        return GmailWorker()
    from .simulator.gmail_sim import GmailSimulator
    return GmailSimulator()


def get_slack_worker():
    if INGESTION_MODE == "real":
        from .slack import SlackWorker
        return SlackWorker()
    from .simulator.slack_sim import SlackSimulator
    return SlackSimulator()


def get_calendar_worker():
    if INGESTION_MODE == "real":
        from .calendar import poll_calendar_events
        return poll_calendar_events
    from .simulator.calendar_sim import poll_calendar_simulated
    return poll_calendar_simulated
