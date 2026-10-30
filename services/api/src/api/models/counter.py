from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from .base import RecordModel


class Counter(RecordModel):
  __tablename__ = "counters"

  name: Mapped[str] = mapped_column(String(500), nullable=False)
  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)


class CounterReset(RecordModel):
  __tablename__ = "counter_resets"

  counter_id: Mapped[UUID] = mapped_column(ForeignKey("counters.id"), nullable=False, index=True)
  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  # When it happened, which can be earlier than when it was recorded.
  occurred_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False, server_default=func.now())
