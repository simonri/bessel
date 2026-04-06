import datetime
from typing import Any

from pydantic import Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema


class CaptureItem(Schema):
  text: str = Field(description="Captured thought.")
  timestamp: str = Field(description="ISO timestamp of capture.")


class JournalEntrySchema(IDSchema, TimestampedSchema):
  entry_date: datetime.date = Field(description="Calendar date for this entry.")

  # Morning Prime
  priority: str | None = Field(default=None, description="The one thing today.")
  friction: str | None = Field(default=None, description="What might stop me.")
  gratitude_1: str | None = Field(default=None, description="Gratitude bullet 1.")
  gratitude_2: str | None = Field(default=None, description="Gratitude bullet 2.")
  gratitude_3: str | None = Field(default=None, description="Gratitude bullet 3.")
  morning_committed_at: datetime.datetime | None = Field(default=None, description="When morning was committed.")

  # Capture
  captures: list[dict[str, Any]] | None = Field(default=None, description="Captured thoughts.")

  # Evening Audit
  scorecard: int | None = Field(default=None, description="Day rating 1-5.")
  priority_done: bool | None = Field(default=None, description="Did the priority get done.")
  insight: str | None = Field(default=None, description="What did I learn today.")
  seed: str | None = Field(default=None, description="Problem for tomorrow.")


class JournalEntryUpsert(Schema):
  priority: str | None = Field(default=None)
  friction: str | None = Field(default=None)
  gratitude_1: str | None = Field(default=None)
  gratitude_2: str | None = Field(default=None)
  gratitude_3: str | None = Field(default=None)
  morning_committed_at: datetime.datetime | None = Field(default=None)
  captures: list[dict[str, Any]] | None = Field(default=None)
  scorecard: int | None = Field(default=None, ge=1, le=5)
  priority_done: bool | None = Field(default=None)
  insight: str | None = Field(default=None)
  seed: str | None = Field(default=None)


class JournalCalendarDay(Schema):
  entry_date: datetime.date
  has_morning: bool = False
  has_audit: bool = False


class JournalCalendarResponse(Schema):
  days: list[JournalCalendarDay]


class JournalStreakResponse(Schema):
  current_streak: int
  longest_streak: int
  total_entries: int


class JournalEntryListResponse(ListResource[JournalEntrySchema]):
  pass
