from uuid import UUID

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import RecordModel


class Counter(RecordModel):
  __tablename__ = "counters"

  name: Mapped[str] = mapped_column(String(500), nullable=False)


class CounterReset(RecordModel):
  __tablename__ = "counter_resets"

  counter_id: Mapped[UUID] = mapped_column(ForeignKey("counters.id"), nullable=False, index=True)
