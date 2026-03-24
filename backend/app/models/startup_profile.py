import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Float, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from .base import Base


class StartupProfile(Base):
    __tablename__ = "startup_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    stage: Mapped[str | None] = mapped_column(String(50), nullable=True)
    mrr_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    burn_rate_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    runway_months: Mapped[float | None] = mapped_column(Float, nullable=True)
    headcount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    has_cto: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    dev_spend_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "user_id": str(self.user_id),
            "stage": self.stage,
            "mrr_usd": self.mrr_usd,
            "burn_rate_usd": self.burn_rate_usd,
            "runway_months": self.runway_months,
            "headcount": self.headcount,
            "has_cto": self.has_cto,
            "dev_spend_pct": self.dev_spend_pct,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
