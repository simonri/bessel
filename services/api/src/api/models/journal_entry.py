from datetime import date, datetime

from sqlalchemy import Boolean, Date, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class JournalEntry(RecordModel):
  __tablename__ = "journal_entries"

  entry_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)

  # Morning Prime
  priority: Mapped[str | None] = mapped_column(Text, nullable=True)
  friction: Mapped[str | None] = mapped_column(Text, nullable=True)
  gratitude_1: Mapped[str | None] = mapped_column(Text, nullable=True)
  gratitude_2: Mapped[str | None] = mapped_column(Text, nullable=True)
  gratitude_3: Mapped[str | None] = mapped_column(Text, nullable=True)
  morning_committed_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

  # Capture
  captures: Mapped[list | None] = mapped_column(JSONB, nullable=True)

  # Evening Audit
  scorecard: Mapped[int | None] = mapped_column(Integer, nullable=True)
  priority_done: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
  insight: Mapped[str | None] = mapped_column(Text, nullable=True)
  seed: Mapped[str | None] = mapped_column(Text, nullable=True)
