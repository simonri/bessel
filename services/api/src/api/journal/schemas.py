from datetime import date
from typing import Any

from pydantic import Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema


class JournalEntrySchema(IDSchema, TimestampedSchema):
  entry_date: date = Field(description="Calendar date for this entry.")
  body: str | None = Field(default=None, description="Free-form markdown body.")
  mood: int | None = Field(default=None, description="Mood rating 1-5.")
  energy: int | None = Field(default=None, description="Energy rating 1-5.")
  focus: int | None = Field(default=None, description="Focus quality 1-5.")
  sleep_hours: float | None = Field(default=None, description="Hours of sleep.")
  wins: str | None = Field(default=None, description="Wins for the day.")
  blockers: str | None = Field(default=None, description="Blockers / challenges.")
  learnings: str | None = Field(default=None, description="Key learnings.")
  gratitude: str | None = Field(default=None, description="Gratitude notes.")
  intention: str | None = Field(default=None, description="Intention for tomorrow.")
  decisions: list[dict[str, Any]] | None = Field(default=None, description="Decisions log.")
  tags: list[str] | None = Field(default=None, description="Tags.")
  word_count: int = Field(default=0, description="Word count of body.")


class JournalEntryUpsert(Schema):
  body: str | None = Field(default=None)
  mood: int | None = Field(default=None, ge=1, le=5)
  energy: int | None = Field(default=None, ge=1, le=5)
  focus: int | None = Field(default=None, ge=1, le=5)
  sleep_hours: float | None = Field(default=None, ge=0, le=24)
  wins: str | None = Field(default=None)
  blockers: str | None = Field(default=None)
  learnings: str | None = Field(default=None)
  gratitude: str | None = Field(default=None)
  intention: str | None = Field(default=None)
  decisions: list[dict[str, Any]] | None = Field(default=None)
  tags: list[str] | None = Field(default=None)


class JournalCalendarDay(Schema):
  entry_date: date
  mood: int | None = None
  word_count: int = 0
  has_wins: bool = False
  has_learnings: bool = False


class JournalCalendarResponse(Schema):
  days: list[JournalCalendarDay]


class JournalStreakResponse(Schema):
  current_streak: int
  longest_streak: int
  total_entries: int


class JournalEntryListResponse(ListResource[JournalEntrySchema]):
  pass
