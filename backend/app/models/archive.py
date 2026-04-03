import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID, JSONB
from .base import Base


class Archive(Base):
    __tablename__ = "archive"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)
    content_enc: Mapped[str] = mapped_column(Text, nullable=False)
    content_redacted: Mapped[str | None] = mapped_column(Text, nullable=True)
    context_tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    pii_tokens: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self, include_content: bool = False) -> dict:
        data = {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "source": self.source,
            "context_tags": self.context_tags,
            "pii_tokens": self.pii_tokens,
            "ingested_at": self.ingested_at.isoformat(),
        }
        if self.content_redacted is not None:
            data["content_redacted"] = self.content_redacted
        if include_content:
            data["content_enc"] = self.content_enc
        return data
