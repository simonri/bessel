from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class IngestToken(RecordModel):
  """Credential a local daemon (activity monitor, agent usage collector) sends
  to push data for its owner. Only the SHA-256 of the token is stored."""

  __tablename__ = "ingest_tokens"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  name: Mapped[str] = mapped_column(String(100), nullable=False)
  token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
  last_used_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
