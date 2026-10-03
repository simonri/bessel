from collections.abc import AsyncIterator
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
import pytest_asyncio
from api.calendars.edits import EditScope, EventChanges, EventTiming, TargetEvent, UnsupportedEditError
from api.calendars.google import GoogleCalendarClient
from api.calendars.google_edits import GoogleEventEditor
from api.calendars.providers import (
  ProviderConflictError,
  ProviderError,
  ProviderForbiddenError,
  ProviderNotFoundError,
  ProviderScopeError,
  ProviderUnavailableError,
)
from api.tests.calendar_fakes import FakeGoogleCalendar, google_error

TZ = "Europe/Stockholm"
STHLM = ZoneInfo(TZ)
CAL = "me@gmail.com"


def at(day: int, hour: int, minute: int = 0, month: int = 10) -> datetime:
  return datetime(2026, month, day, hour, minute, tzinfo=STHLM)


def timing(start: datetime | date, end: datetime | date) -> EventTiming:
  return EventTiming(start, end, TZ)


def changes(**fields: Any) -> EventChanges:
  return EventChanges(provided=frozenset(fields), **fields)


@pytest.fixture
def google() -> FakeGoogleCalendar:
  return FakeGoogleCalendar()


@pytest_asyncio.fixture
async def editor(google: FakeGoogleCalendar) -> AsyncIterator[GoogleEventEditor]:
  async with httpx.AsyncClient(transport=google.transport()) as http:
    yield GoogleEventEditor(GoogleCalendarClient(http), "token", send_updates=False, time_zone=TZ)


def weekly_series(google: FakeGoogleCalendar, rule: str = "FREQ=WEEKLY;BYDAY=MO", **extra: Any) -> dict[str, Any]:
  return google.add(
    CAL,
    {
      "id": "series",
      "summary": "Planning",
      "start": {"dateTime": "2026-10-05T09:00:00", "timeZone": TZ},
      "end": {"dateTime": "2026-10-05T10:00:00", "timeZone": TZ},
      "recurrence": [f"RRULE:{rule}"],
      **extra,
    },
  )


def occurrence(day: int, *, month: int = 10, etag: str | None = None) -> TargetEvent:
  slot = at(day, 9, month=month)
  return TargetEvent(
    calendar_external_id=CAL,
    external_id=f"series_{slot.strftime('%Y%m%d')}",
    start=slot,
    end=at(day, 10, month=month),
    series_id="series",
    original_start=slot.isoformat(),
    rule="FREQ=WEEKLY;BYDAY=MO",
    etag=etag,
  )


class TestCreate:
  @pytest.mark.asyncio
  async def test_timed_event_uses_local_time_and_zone(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    event_id = await editor.create(CAL, changes(title="Dentist", timing=timing(at(7, 17), at(7, 18)), location="Kungsgatan 1"))

    request = google.writes()[0]
    assert request.method == "POST"
    assert request.params == {"sendUpdates": "none", "conferenceDataVersion": "1"}
    assert request.body == {
      "summary": "Dentist",
      "start": {"dateTime": "2026-10-07T17:00:00", "timeZone": TZ},
      "end": {"dateTime": "2026-10-07T18:00:00", "timeZone": TZ},
      "location": "Kungsgatan 1",
    }
    assert google.get(CAL, event_id)["summary"] == "Dentist"

  @pytest.mark.asyncio
  async def test_all_day_repeating_with_meet_and_guests(self, google: FakeGoogleCalendar) -> None:
    async with httpx.AsyncClient(transport=google.transport()) as http:
      editor = GoogleEventEditor(GoogleCalendarClient(http), "token", send_updates=True)
      await editor.create(
        CAL,
        changes(
          title="Offsite",
          timing=timing(date(2026, 10, 8), date(2026, 10, 10)),
          rule="FREQ=YEARLY",
          attendees=("a@x.com",),
          add_conference=True,
          busy=False,
        ),
      )
    body = google.writes()[0].body
    assert body is not None
    assert (body["start"], body["end"]) == ({"date": "2026-10-08"}, {"date": "2026-10-10"})
    assert body["recurrence"] == ["RRULE:FREQ=YEARLY"]
    assert body["attendees"] == [{"email": "a@x.com"}]
    assert body["transparency"] == "transparent"
    assert body["conferenceData"]["createRequest"]["conferenceSolutionKey"] == {"type": "hangoutsMeet"}
    assert google.writes()[0].params["sendUpdates"] == "all"


class TestSingleEventEdits:
  @pytest.mark.asyncio
  async def test_patch_sends_only_changed_fields_with_etag(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    etag = google.add(CAL, {"id": "e1", "summary": "Old", "reminders": {"useDefault": False, "overrides": [{"method": "popup", "minutes": 5}]}})["etag"]
    target = TargetEvent(CAL, "e1", at(7, 9), at(7, 10), etag=etag)

    assert await editor.update(target, changes(title="New"), EditScope.this) == "e1"

    patch = google.writes()[0]
    assert (patch.method, patch.body, patch.headers["if-match"]) == ("PATCH", {"summary": "New"}, etag)
    # Untouched fields like reminders survive.
    assert google.get(CAL, "e1")["reminders"]["overrides"] == [{"method": "popup", "minutes": 5}]

  @pytest.mark.asyncio
  async def test_attendees_keep_existing_responses(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    stored = google.add(CAL, {"id": "e1", "attendees": [{"email": "Al@x.com", "responseStatus": "accepted", "displayName": "Al"}]})
    target = TargetEvent(CAL, "e1", at(7, 9), at(7, 10), etag=stored["etag"])

    await editor.update(target, changes(attendees=("al@x.com", "bo@x.com")), EditScope.this)

    assert google.get(CAL, "e1")["attendees"] == [
      {"email": "Al@x.com", "responseStatus": "accepted", "displayName": "Al"},
      {"email": "bo@x.com"},
    ]

  @pytest.mark.asyncio
  async def test_clearing_location_and_description(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    stored = google.add(CAL, {"id": "e1", "location": "Here", "description": "Notes"})
    await editor.update(TargetEvent(CAL, "e1", at(7, 9), at(7, 10), etag=stored["etag"]), changes(location=None, description=None), EditScope.this)
    assert google.writes()[0].body == {"location": "", "description": ""}

  @pytest.mark.asyncio
  async def test_making_an_event_repeat_adds_rule_and_zone(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    stored = google.add(CAL, {"id": "e1", "start": {"dateTime": "2026-10-07T09:00:00+02:00"}, "end": {"dateTime": "2026-10-07T10:00:00+02:00"}})
    await editor.update(TargetEvent(CAL, "e1", at(7, 9), at(7, 10), etag=stored["etag"]), changes(rule="FREQ=DAILY"), EditScope.this)

    event = google.get(CAL, "e1")
    assert event["recurrence"] == ["RRULE:FREQ=DAILY"]
    assert event["start"]["timeZone"] == TZ

  @pytest.mark.asyncio
  async def test_move_to_another_calendar_then_patch(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    stored = google.add(CAL, {"id": "e1", "summary": "Old"})
    target = TargetEvent(CAL, "e1", at(7, 9), at(7, 10), etag=stored["etag"])

    await editor.update(target, changes(title="New"), EditScope.this, destination="work")

    assert "e1" not in google.events[CAL]
    assert google.get("work", "e1")["summary"] == "New"
    assert [(r.method, r.path.endswith("/move")) for r in google.writes()] == [("POST", True), ("PATCH", False)]


class TestErrors:
  @pytest.mark.asyncio
  @pytest.mark.parametrize(
    ("failure", "error"),
    [
      ((412, {"error": {"code": 412}}), ProviderConflictError),
      (google_error(403, "insufficientPermissions"), ProviderScopeError),
      (google_error(403, "forbiddenForNonOrganizer", "Shared properties can only be changed by the organizer"), ProviderForbiddenError),
      (google_error(403, "rateLimitExceeded"), ProviderUnavailableError),
      (google_error(429, "rateLimitExceeded"), ProviderUnavailableError),
      ((503, {"error": {"code": 503}}), ProviderUnavailableError),
      ((410, {"error": {"code": 410}}), ProviderNotFoundError),
      (google_error(400, "invalid", "The specified time range is empty."), ProviderError),
    ],
  )
  async def test_patch_failures_are_typed(
    self, google: FakeGoogleCalendar, editor: GoogleEventEditor, failure: tuple[int, dict[str, Any]], error: type[Exception]
  ) -> None:
    google.add(CAL, {"id": "e1"})
    google.failures[("PATCH", "e1")] = failure
    with pytest.raises(error):
      await editor.update(TargetEvent(CAL, "e1", at(7, 9), at(7, 10)), changes(title="x"), EditScope.this)

  @pytest.mark.asyncio
  async def test_stale_etag_is_a_conflict(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    google.add(CAL, {"id": "e1"})
    with pytest.raises(ProviderConflictError):
      await editor.update(TargetEvent(CAL, "e1", at(7, 9), at(7, 10), etag='"stale"'), changes(title="x"), EditScope.this)

  @pytest.mark.asyncio
  async def test_bad_request_message_is_kept(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    google.add(CAL, {"id": "e1"})
    google.failures[("PATCH", "e1")] = google_error(400, "invalid", "The specified time range is empty.")
    with pytest.raises(ProviderError, match="time range is empty"):
      await editor.update(TargetEvent(CAL, "e1", at(7, 9), at(7, 10)), changes(title="x"), EditScope.this)


class TestRepeatingThis:
  @pytest.mark.asyncio
  async def test_patches_only_the_instance(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    instance = google.add(CAL, {"id": "series_20261012", "recurringEventId": "series"})

    result = await editor.update(occurrence(12, etag=instance["etag"]), changes(timing=timing(at(12, 11), at(12, 12))), EditScope.this)

    assert result == "series_20261012"
    assert google.get(CAL, "series_20261012")["start"] == {"dateTime": "2026-10-12T11:00:00", "timeZone": TZ}
    assert google.get(CAL, "series")["start"]["dateTime"] == "2026-10-05T09:00:00"

  @pytest.mark.asyncio
  async def test_changing_the_rule_needs_a_wider_scope(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    with pytest.raises(UnsupportedEditError):
      await editor.update(occurrence(12), changes(rule="FREQ=DAILY"), EditScope.this)

  @pytest.mark.asyncio
  async def test_only_whole_series_can_change_calendar(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    with pytest.raises(UnsupportedEditError):
      await editor.update(occurrence(12), changes(), EditScope.this, destination="work")


class TestRepeatingAll:
  @pytest.mark.asyncio
  async def test_time_change_moves_the_series_start(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    # The 12th's occurrence moved 09:00 -> 10:30 and got longer.
    await editor.update(occurrence(12), changes(title="Sync", timing=timing(at(12, 10, 30), at(12, 12))), EditScope.all)

    series = google.get(CAL, "series")
    assert series["summary"] == "Sync"
    assert series["start"] == {"dateTime": "2026-10-05T10:30:00", "timeZone": TZ}
    assert series["end"] == {"dateTime": "2026-10-05T12:00:00", "timeZone": TZ}
    assert series["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO"]

  @pytest.mark.asyncio
  async def test_moving_to_another_day_shifts_weekday_and_exclusions(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    google.get(CAL, "series")["recurrence"].append("EXDATE;TZID=Europe/Stockholm:20261019T090000")

    await editor.update(occurrence(12), changes(timing=timing(at(13, 9), at(13, 10))), EditScope.all)

    series = google.get(CAL, "series")
    assert series["start"]["dateTime"] == "2026-10-06T09:00:00"
    assert series["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=TU", "EXDATE;TZID=Europe/Stockholm:20261020T090000"]

  @pytest.mark.asyncio
  async def test_moving_an_hour_earlier_keeps_the_weekday(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    await editor.update(occurrence(12), changes(timing=timing(at(12, 8), at(12, 9))), EditScope.all)
    assert google.get(CAL, "series")["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO"]

  @pytest.mark.asyncio
  async def test_moving_an_occurrence_after_dst_moves_by_wall_clock(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    # 26 Oct is after Stockholm leaves summer time; 09:00 -> 10:00 local.
    await editor.update(occurrence(26), changes(timing=timing(at(26, 10), at(26, 11))), EditScope.all)
    assert google.get(CAL, "series")["start"]["dateTime"] == "2026-10-05T10:00:00"

  @pytest.mark.asyncio
  async def test_changing_the_rule(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    await editor.update(occurrence(12), changes(rule="FREQ=DAILY;COUNT=5"), EditScope.all)
    assert google.get(CAL, "series")["recurrence"] == ["RRULE:FREQ=DAILY;COUNT=5"]

  @pytest.mark.asyncio
  async def test_switching_series_to_all_day(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    google.get(CAL, "series")["recurrence"].append("EXDATE;TZID=Europe/Stockholm:20261019T090000")
    await editor.update(occurrence(12), changes(timing=timing(date(2026, 10, 12), date(2026, 10, 13))), EditScope.all)

    series = google.get(CAL, "series")
    assert (series["start"], series["end"]) == ({"date": "2026-10-05"}, {"date": "2026-10-06"})
    # Timed exclusions can't apply to an all-day series.
    assert series["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO"]

  @pytest.mark.asyncio
  async def test_series_move_uses_the_parents_etag(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    etag = weekly_series(google)["etag"]
    await editor.update(occurrence(12), changes(title="x"), EditScope.all)
    patch = next(r for r in google.writes() if r.method == "PATCH")
    assert patch.path.endswith("/events/series")
    assert patch.headers["if-match"] == etag

  @pytest.mark.asyncio
  async def test_moving_a_series_to_another_calendar(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    await editor.update(occurrence(12), changes(), EditScope.all, destination="work")
    assert "series" in google.events["work"]


class TestRepeatingFollowing:
  @pytest.mark.asyncio
  async def test_splits_into_two_series(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(
      google,
      "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T225959Z",
      reminders={"useDefault": False, "overrides": [{"method": "popup", "minutes": 10}]},
      extendedProperties={"private": {"k": "v"}},
    )
    google.get(CAL, "series")["recurrence"] += ["EXDATE;TZID=Europe/Stockholm:20261012T090000", "EXDATE;TZID=Europe/Stockholm:20261026T090000"]

    new_id = await editor.update(occurrence(19), changes(title="Planning v2", timing=timing(at(19, 13), at(19, 14))), EditScope.following)

    old, new = google.get(CAL, "series"), google.get(CAL, new_id)
    assert old["summary"] == "Planning"
    assert old["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261019T065959Z", "EXDATE;TZID=Europe/Stockholm:20261012T090000"]
    assert new["summary"] == "Planning v2"
    assert new["start"] == {"dateTime": "2026-10-19T13:00:00", "timeZone": TZ}
    # The exclusion after the split moved with its occurrence's new time.
    assert new["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130T225959Z", "EXDATE;TZID=Europe/Stockholm:20261026T130000"]
    assert new["reminders"]["overrides"] == [{"method": "popup", "minutes": 10}]
    assert new["extendedProperties"] == {"private": {"k": "v"}}

  @pytest.mark.asyncio
  async def test_count_is_shared_between_series(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google, "FREQ=WEEKLY;BYDAY=MO;COUNT=6")
    new_id = await editor.update(occurrence(19), changes(title="x"), EditScope.following)
    assert google.get(CAL, "series")["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2"]
    assert google.get(CAL, new_id)["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=4"]

  @pytest.mark.asyncio
  async def test_new_rule_applies_only_to_the_new_series(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    new_id = await editor.update(occurrence(19), changes(rule="FREQ=DAILY"), EditScope.following)
    assert google.get(CAL, new_id)["recurrence"] == ["RRULE:FREQ=DAILY"]
    assert google.get(CAL, "series")["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261019T065959Z"]

  @pytest.mark.asyncio
  async def test_from_the_first_occurrence_edits_the_series(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    result = await editor.update(occurrence(5), changes(title="All of it"), EditScope.following)
    assert result == "series"
    assert google.get(CAL, "series")["summary"] == "All of it"
    assert not any(r.method == "POST" for r in google.writes())

  @pytest.mark.asyncio
  async def test_conflict_on_the_original_rolls_back_the_new_series(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    google.failures[("PATCH", "series")] = (412, {"error": {"code": 412}})

    with pytest.raises(ProviderConflictError):
      await editor.update(occurrence(19), changes(title="x"), EditScope.following)

    assert list(google.events[CAL]) == ["series"]


class TestDelete:
  @pytest.mark.asyncio
  async def test_single_event(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    stored = google.add(CAL, {"id": "e1"})
    await editor.delete(TargetEvent(CAL, "e1", at(7, 9), at(7, 10), etag=stored["etag"]), EditScope.this)
    assert google.events[CAL] == {}
    assert google.writes()[0].headers["if-match"] == stored["etag"]

  @pytest.mark.asyncio
  async def test_already_deleted_is_fine(self, editor: GoogleEventEditor) -> None:
    await editor.delete(TargetEvent(CAL, "gone", at(7, 9), at(7, 10)), EditScope.this)

  @pytest.mark.asyncio
  async def test_one_occurrence(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    google.add(CAL, {"id": "series_20261012"})
    await editor.delete(occurrence(12), EditScope.this)
    assert set(google.events[CAL]) == {"series"}

  @pytest.mark.asyncio
  async def test_whole_series(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    await editor.delete(occurrence(12), EditScope.all)
    assert google.events[CAL] == {}

  @pytest.mark.asyncio
  async def test_following_truncates_the_series(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google, "FREQ=WEEKLY;BYDAY=MO;COUNT=10")
    await editor.delete(occurrence(19), EditScope.following)
    assert google.get(CAL, "series")["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2"]

  @pytest.mark.asyncio
  async def test_following_from_the_first_occurrence_deletes_everything(self, google: FakeGoogleCalendar, editor: GoogleEventEditor) -> None:
    weekly_series(google)
    await editor.delete(occurrence(5), EditScope.following)
    assert google.events[CAL] == {}

  @pytest.mark.asyncio
  async def test_guests_are_notified_when_asked(self, google: FakeGoogleCalendar) -> None:
    google.add(CAL, {"id": "e1"})
    async with httpx.AsyncClient(transport=google.transport()) as http:
      await GoogleEventEditor(GoogleCalendarClient(http), "token", send_updates=True).delete(TargetEvent(CAL, "e1", at(7, 9), at(7, 10)), EditScope.this)
    assert google.writes()[0].params["sendUpdates"] == "all"
