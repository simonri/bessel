from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import REAL, TIMESTAMP, Date, Enum, ForeignKey, Index, Integer, SmallInteger, String, Text, Uuid, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class MemoryKind(StrEnum):
  stated = "stated"
  observed = "observed"
  inferred = "inferred"
  corrected = "corrected"


class MemoryStatus(StrEnum):
  hypothesis = "hypothesis"
  confirmed = "confirmed"
  rejected = "rejected"


class MemorySensitivity(StrEnum):
  normal = "normal"
  health = "health"
  money = "money"
  relationships = "relationships"
  private = "private"


class MemoryFact(RecordModel):
  """One thing an assistant knows about the user, from shoe size to what came
  before their late nights. Facts are never overwritten: a changed fact closes
  the old one (`valid_to`, `superseded_by_id`), so the history stays."""

  __tablename__ = "memory_facts"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
  # A free path such as "kropp/kläder" or "människor/familj"; areas grow with what is learned.
  area: Mapped[str] = mapped_column(String(100), nullable=False)
  # What the fact is about within its area, e.g. "skostorlek". One current fact per area and attribute.
  attribute: Mapped[str] = mapped_column(String(200), nullable=False)
  statement: Mapped[str] = mapped_column(Text, nullable=False)
  kind: Mapped[MemoryKind] = mapped_column(Enum(MemoryKind, name="memory_kind"), nullable=False)
  status: Mapped[MemoryStatus] = mapped_column(Enum(MemoryStatus, name="memory_status"), nullable=False)
  importance: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=3, server_default=text("3"))
  sensitivity: Mapped[MemorySensitivity] = mapped_column(
    Enum(MemorySensitivity, name="memory_sensitivity"), nullable=False, default=MemorySensitivity.normal, server_default="normal"
  )
  # [{"source": "sleep", "ref": "2026-10-27", "note": "..."}], newest last.
  evidence: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
  valid_from: Mapped[date | None] = mapped_column(Date, nullable=True)
  valid_to: Mapped[date | None] = mapped_column(Date, nullable=True)
  superseded_by_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("memory_facts.id", ondelete="SET NULL"), nullable=True)
  confirmed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  confirm_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default=text("0"))
  # What the fact means, for search by meaning; recomputed when the text or the model changes (see embedding_key).
  embedding: Mapped[list[float] | None] = mapped_column(ARRAY(REAL), nullable=True)
  embedding_key: Mapped[str | None] = mapped_column(String(64), nullable=True)

  __table_args__ = (
    Index(
      "ix_memory_facts_current_attribute",
      "user_id",
      text("lower(area)"),
      text("lower(attribute)"),
      unique=True,
      postgresql_where=text("valid_to IS NULL AND deleted_at IS NULL"),
    ),
  )
