from datetime import date

from sqlalchemy import Date, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class JournalEntry(RecordModel):
  __tablename__ = "journal_entries"

  # One entry per calendar date
  entry_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True, index=True)

  # Free-form body (markdown)
  body: Mapped[str | None] = mapped_column(Text, nullable=True)

  # Trackable metrics (1-5 scale, all optional)
  mood: Mapped[int | None] = mapped_column(Integer, nullable=True)
  energy: Mapped[int | None] = mapped_column(Integer, nullable=True)
  focus: Mapped[int | None] = mapped_column(Integer, nullable=True)
  sleep_hours: Mapped[float | None] = mapped_column(Float, nullable=True)

  # Structured reflection (each its own column for queryability)
  wins: Mapped[str | None] = mapped_column(Text, nullable=True)
  blockers: Mapped[str | None] = mapped_column(Text, nullable=True)
  learnings: Mapped[str | None] = mapped_column(Text, nullable=True)
  gratitude: Mapped[str | None] = mapped_column(Text, nullable=True)
  intention: Mapped[str | None] = mapped_column(Text, nullable=True)

  # Decisions log — structured as JSON array: [{decision, reasoning, context}]
  decisions: Mapped[list | None] = mapped_column(JSONB, nullable=True)

  # Organization
  tags: Mapped[list[str] | None] = mapped_column(ARRAY(String(50)), nullable=True)
  word_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
