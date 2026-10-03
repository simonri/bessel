from datetime import date, datetime
from uuid import UUID

from pydantic import Field

from api.common.schemas import Schema
from api.models.calendar_account import CalendarProvider


class CalendarSchema(Schema):
  id: UUID
  name: str
  color: str = Field(description="Hex color, `#rrggbb`.")
  hidden: bool


class CalendarAccountSchema(Schema):
  id: UUID
  provider: CalendarProvider
  email: str
  last_synced_at: datetime | None
  sync_error: str | None = Field(description="Why the last sync failed, or null if it succeeded.")
  calendars: list[CalendarSchema]


class CalendarAccountListResponse(Schema):
  accounts: list[CalendarAccountSchema]


class GoogleAuthorizeResponse(Schema):
  url: str = Field(description="Google consent URL to open in a browser.")


class ICloudConnectRequest(Schema):
  apple_id: str = Field(min_length=3, max_length=320)
  app_password: str = Field(min_length=1, max_length=64, description="App-specific password from account.apple.com.")


class CalendarUpdate(Schema):
  hidden: bool


class CalendarEventSchema(Schema):
  id: UUID
  calendar_id: UUID
  title: str
  location: str | None
  all_day: bool
  start_at: datetime | None = Field(description="Timed events only.")
  end_at: datetime | None = Field(description="Timed events only.")
  start_date: date | None = Field(description="All-day events only.")
  end_date: date | None = Field(description="All-day events only; exclusive.")


class CalendarEventListResponse(Schema):
  events: list[CalendarEventSchema]
