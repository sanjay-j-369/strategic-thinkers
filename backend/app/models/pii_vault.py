import uuid
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.orm import Mapped, deferred, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from .base import Base

class PiiVault(Base):
    __tablename__ = "pii_vault"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    token: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    encryption_scheme: Mapped[str] = deferred(
        mapped_column(String(50), nullable=False, default="fernet")
    )
