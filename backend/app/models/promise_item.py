import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class PromiseItem(Base):
    __tablename__ = "promise_items"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_ref: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    promise_text: Mapped[str] = mapped_column(Text, nullable=False)
    promised_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="OPEN", index=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    context_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
