import uuid
from datetime import datetime, timezone
from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, deferred, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from .base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    google_token: Mapped[str | None] = mapped_column(String, nullable=True)
    slack_token: Mapped[str | None] = mapped_column(String, nullable=True)
    slack_team_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    slack_channel_ids: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Deferred for backward compatibility with databases that have not yet
    # applied the E2EE migration. Accessing these fields will lazy-load them.
    salt: Mapped[str | None] = deferred(mapped_column(String(255), nullable=True))
    public_key: Mapped[str | None] = deferred(mapped_column(Text, nullable=True))
    encrypted_private_key: Mapped[str | None] = deferred(mapped_column(Text, nullable=True))
    google_last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    slack_last_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "email": self.email,
            "full_name": self.full_name,
            "google_connected": bool(self.google_token),
            "slack_connected": bool(self.slack_token),
            "google_last_synced_at": self.google_last_synced_at.isoformat()
            if self.google_last_synced_at
            else None,
            "slack_last_synced_at": self.slack_last_synced_at.isoformat()
            if self.slack_last_synced_at
            else None,
            "created_at": self.created_at.isoformat(),
        }
