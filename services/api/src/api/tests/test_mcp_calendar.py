from datetime import UTC, date, datetime

import pytest
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error


class TestCalendar:
  @pytest.mark.asyncio
  async def test_events_in_local_days(self, connect: ConnectFixture, save_fixture: SaveFixture, user: User) -> None:
    account = CalendarAccount(user_id=user.id, provider=CalendarProvider.google, email="me@example.com", encrypted_credentials="unused")
    await save_fixture(account)
    calendar = Calendar(account_id=account.id, external_id="primary", name="Personal", color="#16a765")
    await save_fixture(calendar)
    # 23:30 UTC on Oct 4 is already Oct 5 in Stockholm.
    late = CalendarEvent(
      calendar_id=calendar.id,
      external_id="late",
      title="Dentist",
      all_day=False,
      start_at=datetime(2026, 10, 4, 23, 30, tzinfo=UTC),
      end_at=datetime(2026, 10, 5, 0, 30, tzinfo=UTC),
    )
    holiday = CalendarEvent(calendar_id=calendar.id, external_id="hol", title="Holiday", all_day=True, start_date=date(2026, 10, 5), end_date=date(2026, 10, 6))
    yesterday = CalendarEvent(calendar_id=calendar.id, external_id="old", title="Old", all_day=True, start_date=date(2026, 10, 4), end_date=date(2026, 10, 5))
    for event in (late, holiday, yesterday):
      await save_fixture(event)

    args = {"start": "2026-10-05", "end": "2026-10-05", "timezone": "Europe/Stockholm"}
    events = (await mcp_call(connect, "get_calendar_events", args))["events"]
    assert [(e["title"], e["start"]) for e in events] == [("Holiday", "2026-10-05"), ("Dentist", "2026-10-04T23:30:00Z")]
    assert (await mcp_call(connect, "get_calendar_events", args, token="token-b"))["events"] == []

  @pytest.mark.asyncio
  async def test_validates_range_and_timezone(self, connect: ConnectFixture) -> None:
    bad_tz = {"start": "2026-10-05", "end": "2026-10-05", "timezone": "Mars/Olympus"}
    assert await mcp_call_error(connect, "get_calendar_events", bad_tz) == "Unknown timezone: Mars/Olympus"
    backwards = {"start": "2026-10-05", "end": "2026-10-01", "timezone": "UTC"}
    assert await mcp_call_error(connect, "get_calendar_events", backwards) == "The end day must not be before the start day."
    too_long = {"start": "2026-01-01", "end": "2026-12-31", "timezone": "UTC"}
    assert await mcp_call_error(connect, "get_calendar_events", too_long) == "The range can span at most 62 days."
