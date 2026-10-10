from datetime import datetime
from typing import Annotated

from pydantic import UUID4, Field

from api.common.schemas import IDSchema, Schema, TimestampedSchema

Color = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]
Currency = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
Rate = Annotated[float, Field(ge=0, le=1_000_000)]


class TimeProjectSchema(IDSchema, TimestampedSchema):
  name: str
  client: str | None
  color: str
  hourly_rate: float | None
  currency: str | None
  archived_at: datetime | None


class TimeProjectCreate(Schema):
  name: str = Field(min_length=1, max_length=200)
  client: str | None = Field(default=None, max_length=200)
  color: Color
  hourly_rate: Rate | None = None
  currency: Currency | None = None


class TimeProjectUpdate(Schema):
  name: str | None = Field(default=None, min_length=1, max_length=200)
  client: str | None = Field(default=None, max_length=200)
  color: Color | None = None
  hourly_rate: Rate | None = None
  currency: Currency | None = None
  archived: bool | None = None


class TimeEntrySchema(IDSchema, TimestampedSchema):
  time_project_id: UUID4
  start_ts: datetime
  end_ts: datetime
  note: str | None


class TimeEntryCreate(Schema):
  time_project_id: UUID4
  start_ts: datetime
  end_ts: datetime
  note: str | None = Field(default=None, max_length=2000)


class TimeEntryUpdate(Schema):
  time_project_id: UUID4 | None = None
  start_ts: datetime | None = None
  end_ts: datetime | None = None
  note: str | None = Field(default=None, max_length=2000)


class TimeMonthTotal(Schema):
  time_project_id: UUID4
  month: int = Field(ge=1, le=12)
  seconds: int


class TimeSummarySchema(Schema):
  year: int
  totals: list[TimeMonthTotal]
