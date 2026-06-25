from uuid import UUID

from sqlalchemy import ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from .base import RecordModel


class Counter(RecordModel):
  __tablename__ = "counters"

  name: Mapped[str] = mapped_column(String(500), nullable=False)
  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)


class CounterReset(RecordModel):
  __tablename__ = "counter_resets"

  counter_id: Mapped[UUID] = mapped_column(ForeignKey("counters.id"), nullable=False, index=True)
  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
