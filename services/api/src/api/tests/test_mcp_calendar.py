from datetime import UTC, date, datetime
from typing import Any

import pytest
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error

# A Monday far enough ahead that none of it is clipped as past.
MONDAY = date(2030, 1, 7)


async def save_calendar(save_fixture: SaveFixture, user: User, *, hidden: bool = False) -> Calendar:
  email = f"{'hidden' if hidden else 'me'}@example.com"
  account = CalendarAccount(user_id=user.id, provider=CalendarProvider.google, email=email, encrypted_credentials="unused")
  await save_fixture(account)
  calendar = Calendar(account_id=account.id, external_id="primary", name="Personal", color="#16a765", hidden=hidden)
  await save_fixture(calendar)
  return calendar


async def save_timed(save_fixture: SaveFixture, calendar: Calendar, start_hour: int, end_hour: int, **fields: Any) -> None:
  start, end = datetime(2030, 1, 7, start_hour, tzinfo=UTC), datetime(2030, 1, 7, end_hour, tzinfo=UTC)
  await save_fixture(
    CalendarEvent(calendar_id=calendar.id, external_id=f"{start_hour}-{end_hour}", title="Busy", all_day=False, start_at=start, end_at=end, **fields)
  )


def slots(result: dict[str, Any]) -> list[tuple[str, str, int]]:
  return [(slot["start"], slot["end"], slot["minutes"]) for slot in result["slots"]]


class TestCalendar:
  @pytest.mark.asyncio
  async def test_events_in_local_days(self, connect: ConnectFixture, save_fixture: SaveFixture, user: User) -> None:
    calendar = await save_calendar(save_fixture, user)
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


class TestFindFreeTime:
  @pytest.mark.asyncio
  async def test_free_windows_ignore_free_declined_and_hidden_events(self, connect: ConnectFixture, save_fixture: SaveFixture, user: User) -> None:
    calendar = await save_calendar(save_fixture, user)
    await save_timed(save_fixture, calendar, 10, 11)
    await save_timed(save_fixture, calendar, 10, 12, my_response="tentative")
    await save_timed(save_fixture, calendar, 13, 14, my_response="declined")
    await save_timed(save_fixture, calendar, 15, 16, busy=False)
    await save_fixture(CalendarEvent(calendar_id=calendar.id, external_id="hol", title="Holiday", all_day=True, start_date=MONDAY, end_date=date(2030, 1, 8)))
    await save_timed(save_fixture, await save_calendar(save_fixture, user, hidden=True), 16, 17)

    args = {"duration_minutes": 60, "start": "2030-01-07", "end": "2030-01-07", "timezone": "Europe/Stockholm"}
    result = await mcp_call(connect, "find_free_time", args)
    assert result["timezone"] == "Europe/Stockholm"
    assert slots(result) == [
      ("2030-01-07T09:00:00+01:00", "2030-01-07T11:00:00+01:00", 120),
      ("2030-01-07T13:00:00+01:00", "2030-01-07T18:00:00+01:00", 300),
    ]
    assert result["days"] == [{"day": "2030-01-07", "free_minutes": 420, "longest_free_minutes": 300, "all_day_events": ["Holiday"]}]

  @pytest.mark.asyncio
  async def test_users_only_see_their_own_busy_time(self, connect: ConnectFixture, save_fixture: SaveFixture, user: User, other_user: User) -> None:
    await save_timed(save_fixture, await save_calendar(save_fixture, user), 8, 12)
    await save_timed(save_fixture, await save_calendar(save_fixture, other_user), 12, 17)

    args = {"duration_minutes": 30, "start": "2030-01-07", "end": "2030-01-07", "timezone": "UTC"}
    assert slots(await mcp_call(connect, "find_free_time", args)) == [("2030-01-07T12:00:00Z", "2030-01-07T18:00:00Z", 360)]
    assert slots(await mcp_call(connect, "find_free_time", args, token="token-b")) == [
      ("2030-01-07T09:00:00Z", "2030-01-07T12:00:00Z", 180),
      ("2030-01-07T17:00:00Z", "2030-01-07T18:00:00Z", 60),
    ]

  @pytest.mark.asyncio
  async def test_defaults_to_a_week_of_weekdays_and_applies_the_limit(self, connect: ConnectFixture) -> None:
    result = await mcp_call(connect, "find_free_time", {"duration_minutes": 30, "start": "2030-01-07", "timezone": "UTC", "limit": 3})
    assert [day["day"] for day in result["days"]] == ["2030-01-07", "2030-01-08", "2030-01-09", "2030-01-10", "2030-01-11"]
    assert result["total_slots"] == 5
    assert slots(result)[0] == ("2030-01-07T09:00:00Z", "2030-01-07T18:00:00Z", 540)
    assert len(result["slots"]) == 3

    weekend = {"duration_minutes": 30, "start": "2030-01-12", "end": "2030-01-13", "day_end": "24:00", "include_weekends": True, "timezone": "UTC"}
    assert slots(await mcp_call(connect, "find_free_time", weekend))[1] == ("2030-01-13T09:00:00Z", "2030-01-14T00:00:00Z", 900)

  @pytest.mark.asyncio
  async def test_past_days_have_no_free_time(self, connect: ConnectFixture) -> None:
    args = {"duration_minutes": 30, "start": "yesterday", "end": "yesterday", "include_weekends": True, "timezone": "UTC"}
    result = await mcp_call(connect, "find_free_time", args)
    assert result["slots"] == []
    assert result["days"][0]["free_minutes"] == 0

  @pytest.mark.asyncio
  async def test_validates_input(self, connect: ConnectFixture) -> None:
    base = {"duration_minutes": 60, "start": "2030-01-07", "timezone": "UTC"}
    assert (
      await mcp_call_error(connect, "find_free_time", {**base, "day_start": "9am"}) == "`day_start` must be a local time as HH:MM, e.g. '09:00'; got '9am'."
    )
    assert (
      await mcp_call_error(connect, "find_free_time", {**base, "day_end": "24:30"}) == "`day_end` must be a local time as HH:MM, e.g. '09:00'; got '24:30'."
    )
    assert await mcp_call_error(connect, "find_free_time", {**base, "day_start": "18:00", "day_end": "09:00"}) == "`day_end` must be after `day_start`."
    too_long = {**base, "duration_minutes": 120, "day_start": "13:00", "day_end": "14:00"}
    assert await mcp_call_error(connect, "find_free_time", too_long) == "A 120-minute slot can't fit between 13:00 and 14:00."
    assert await mcp_call_error(connect, "find_free_time", {**base, "end": "2030-03-01"}) == "The range can span at most 31 days."
    assert await mcp_call_error(connect, "find_free_time", {**base, "end": "2030-01-01"}) == "The end day must not be before the start day."
    assert await mcp_call_error(connect, "find_free_time", {**base, "timezone": "Mars/Olympus"}) == "Unknown timezone: Mars/Olympus"
    assert "duration_minutes" in await mcp_call_error(connect, "find_free_time", {**base, "duration_minutes": 4})
    assert "limit" in await mcp_call_error(connect, "find_free_time", {**base, "limit": 0})
