from datetime import date, datetime
from typing import Literal
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


class CalendarEventAttendee(Schema):
  email: str
  name: str | None
  response: Literal["accepted", "declined", "tentative", "needs_action"]


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
  description: str | None = Field(description="Plain text; never HTML.")
  creator_name: str | None
  creator_email: str | None
  attendees: list[CalendarEventAttendee]
  conference_url: str | None = Field(description="Video meeting link, if any.")
  html_link: str | None = Field(description="Event page in the provider's own UI (Google only).")
  busy: bool = Field(description="False when the event is marked free/transparent.")
  recurring: bool
  visibility: Literal["public", "private", "confidential"] | None = Field(description="Null means the calendar's default.")


class CalendarEventListResponse(Schema):
  events: list[CalendarEventSchema]
