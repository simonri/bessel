from collections.abc import AsyncIterator
from datetime import UTC, date, datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
import pytest_asyncio
from api.calendars.edits import EditScope, EventChanges, EventTiming, TargetEvent, UnsupportedEditError
from api.calendars.icloud import ICalResource, ICloudCalendarClient, expand_events
from api.calendars.icloud_edits import (
  ICloudEventEditor,
  build_event,
  delete_occurrence,
  edit_event,
  edit_occurrence,
  edit_series,
  split_series,
  truncate_series,
)
from api.calendars.providers import ProviderConflictError, ProviderEvent, ProviderForbiddenError
from api.tests.calendar_fakes import FakeCalDAV

TZ = "Europe/Stockholm"
STHLM = ZoneInfo(TZ)
NOW = datetime(2026, 10, 3, 12, tzinfo=UTC)
COLLECTION = "https://p42-caldav.icloud.com/1234/calendars/home/"
HREF = f"{COLLECTION}standup.ics"
WINDOW = (datetime(2026, 9, 1, tzinfo=UTC), datetime(2027, 1, 1, tzinfo=UTC))


def at(day: int, hour: int, minute: int = 0, month: int = 10) -> datetime:
  return datetime(2026, month, day, hour, minute, tzinfo=STHLM)


def changes(**fields: Any) -> EventChanges:
  return EventChanges(provided=frozenset(fields), **fields)


def timing(start: datetime | date, end: datetime | date) -> EventTiming:
  return EventTiming(start, end, TZ)


SERIES = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Apple Inc.//iOS 18//EN
BEGIN:VEVENT
UID:standup
DTSTAMP:20260901T000000Z
DTSTART;TZID=Europe/Stockholm:20261005T090000
DTEND;TZID=Europe/Stockholm:20261005T093000
RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=8
EXDATE;TZID=Europe/Stockholm:20261019T090000
SUMMARY:Standup
X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC
SEQUENCE:3
BEGIN:VALARM
ACTION:DISPLAY
DESCRIPTION:Reminder
TRIGGER:-PT10M
END:VALARM
END:VEVENT
BEGIN:VEVENT
UID:standup
DTSTAMP:20260901T000000Z
RECURRENCE-ID;TZID=Europe/Stockholm:20261102T090000
DTSTART;TZID=Europe/Stockholm:20261102T110000
DTEND;TZID=Europe/Stockholm:20261102T113000
SUMMARY:Standup (moved)
END:VEVENT
END:VCALENDAR"""


def occurrences(*documents: str) -> list[ProviderEvent]:
  resources = [ICalResource(href=f"{COLLECTION}{i}.ics", etag=None, data=d) for i, d in enumerate(documents)]
  return sorted(expand_events(resources, *WINDOW), key=lambda e: e.start_at or datetime.min.replace(tzinfo=UTC))


def local(event: ProviderEvent) -> tuple[str, str]:
  assert event.start_at is not None
  return event.start_at.astimezone(STHLM).strftime("%m-%d %H:%M"), event.title


def series_target(day: int, *, month: int = 10, etag: str | None = None) -> TargetEvent:
  slot = at(day, 9, month=month)
  return TargetEvent(
    calendar_external_id=COLLECTION,
    external_id=f"standup/{slot.isoformat()}",
    start=slot,
    end=at(day, 9, 30, month=month),
    series_id="standup",
    original_start=slot.isoformat(),
    etag=etag,
    resource_href=HREF,
  )


class TestDocumentEdits:
  def test_build_event(self) -> None:
    data = build_event("new-uid", changes(title="Dentist", timing=timing(at(7, 17), at(7, 18)), location="Kungsgatan 1"), NOW)
    assert "BEGIN:VTIMEZONE" in data
    assert "DTSTART;TZID=Europe/Stockholm:20261007T170000" in data
    [event] = occurrences(data)
    assert (event.external_id, event.title, event.location, event.recurring) == ("new-uid", "Dentist", "Kungsgatan 1", False)

  def test_build_all_day_repeating(self) -> None:
    data = build_event("u", changes(title="Bins", timing=timing(date(2026, 10, 6), date(2026, 10, 7)), rule="FREQ=WEEKLY;COUNT=3", busy=False), NOW)
    events = occurrences(data)
    assert [(e.start_date, e.end_date) for e in events] == [
      (date(2026, 10, 6), date(2026, 10, 7)),
      (date(2026, 10, 13), date(2026, 10, 14)),
      (date(2026, 10, 20), date(2026, 10, 21)),
    ]
    assert not events[0].busy

  def test_edit_single_keeps_unknown_properties(self) -> None:
    single = SERIES.replace("RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=8\n", "").replace("EXDATE;TZID=Europe/Stockholm:20261019T090000\n", "")
    single = single[: single.index("BEGIN:VEVENT\nUID:standup\nDTSTAMP:20260901T000000Z\nRECURRENCE-ID")] + "END:VCALENDAR"
    data = edit_event(single, "standup", changes(title="Daily sync", location=None, timing=timing(at(6, 10), at(6, 11))), NOW)

    assert "X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC" in data
    assert "TRIGGER:-PT10M" in data
    assert "SEQUENCE:4" in data
    [event] = occurrences(data)
    assert local(event) == ("10-06 10:00", "Daily sync")

  def test_edit_occurrence_adds_an_override(self) -> None:
    data = edit_occurrence(SERIES, "standup", at(12, 9), at(12, 9), at(12, 9, 30), changes(title="Retro", timing=timing(at(12, 14), at(12, 15))), NOW)

    assert "RECURRENCE-ID;TZID=Europe/Stockholm:20261012T090000" in data
    by_day = dict(local(e) for e in occurrences(data))
    assert by_day["10-12 14:00"] == "Retro"
    assert "10-12 09:00" not in by_day
    # The override inherits the series' alarm.
    assert data.count("TRIGGER:-PT10M") == 2

  def test_edit_occurrence_updates_an_existing_override(self) -> None:
    data = edit_occurrence(SERIES, "standup", at(2, 9, month=11), at(2, 11, month=11), at(2, 11, 30, month=11), changes(title="Moved again"), NOW)
    assert data.count("RECURRENCE-ID") == 1
    assert ("11-02 11:00", "Moved again") in [local(e) for e in occurrences(data)]

  def test_edit_occurrence_rejects_rule_changes(self) -> None:
    with pytest.raises(UnsupportedEditError):
      edit_occurrence(SERIES, "standup", at(12, 9), at(12, 9), at(12, 9, 30), changes(rule="FREQ=DAILY"), NOW)

  def test_edit_series_moves_everything_including_exclusions_and_overrides(self) -> None:
    # The 12th moved from Monday 09:00 to Tuesday 10:00.
    data = edit_series(SERIES, "standup", at(12, 9), changes(title="Sync", timing=timing(at(13, 10), at(13, 10, 30))), NOW, TZ)

    assert "RRULE:FREQ=WEEKLY;COUNT=8;BYDAY=TU" in data
    assert "EXDATE;TZID=Europe/Stockholm:20261020T100000" in data
    assert "RECURRENCE-ID;TZID=Europe/Stockholm:20261103T100000" in data
    starts = [local(e) for e in occurrences(data)]
    assert starts[:3] == [("10-06 10:00", "Sync"), ("10-13 10:00", "Sync"), ("10-27 10:00", "Sync")]
    # The moved occurrence keeps its own time but takes the new title.
    assert ("11-02 11:00", "Sync") in starts

  def test_edit_series_across_dst_keeps_wall_clock(self) -> None:
    # 26 Oct is after the DST change; moving it 09:00 -> 09:30 moves the series to 09:30.
    data = edit_series(SERIES, "standup", at(26, 9), changes(timing=timing(at(26, 9, 30), at(26, 10))), NOW, TZ)
    assert {local(e)[0][-5:] for e in occurrences(data) if e.title == "Standup"} == {"09:30"}

  def test_stop_repeating(self) -> None:
    data = edit_series(SERIES, "standup", at(12, 9), changes(rule=None), NOW, TZ)
    assert [local(e) for e in occurrences(data)] == [("10-05 09:00", "Standup")]

  def test_split_series(self) -> None:
    split = split_series(SERIES, "standup", at(26, 9), at(26, 9), at(26, 9, 30), changes(title="Standup v2"), "new-uid", NOW, TZ)
    assert split is not None
    original, new = split

    assert "RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=MO" in original
    assert "RECURRENCE-ID" not in original
    assert "UID:new-uid" in new
    assert "TRIGGER:-PT10M" in new
    starts = [local(e) for e in occurrences(original, new)]
    assert starts == [
      ("10-05 09:00", "Standup"),
      ("10-12 09:00", "Standup"),
      ("10-26 09:00", "Standup v2"),
      ("11-02 11:00", "Standup v2"),
      ("11-09 09:00", "Standup v2"),
      ("11-16 09:00", "Standup v2"),
      ("11-23 09:00", "Standup v2"),
    ]

  def test_split_at_first_occurrence_is_not_a_split(self) -> None:
    assert split_series(SERIES, "standup", at(5, 9), at(5, 9), at(5, 9, 30), changes(title="x"), "new", NOW, TZ) is None

  def test_delete_occurrence(self) -> None:
    data = delete_occurrence(SERIES, "standup", at(2, 9, month=11), NOW)
    starts = [local(e)[0] for e in occurrences(data)]
    assert "11-02 11:00" not in starts
    assert "RECURRENCE-ID" not in data

  def test_truncate(self) -> None:
    data = truncate_series(SERIES, "standup", at(26, 9), NOW)
    assert data is not None
    assert [local(e)[0] for e in occurrences(data)] == ["10-05 09:00", "10-12 09:00"]
    assert truncate_series(SERIES, "standup", at(5, 9), NOW) is None

  def test_all_day_series_occurrence_override_uses_a_date(self) -> None:
    data = build_event("bins", changes(title="Bins", timing=timing(date(2026, 10, 6), date(2026, 10, 7)), rule="FREQ=WEEKLY"), NOW)
    edited = edit_occurrence(data, "bins", date(2026, 10, 13), date(2026, 10, 13), date(2026, 10, 14), changes(title="Glass"), NOW)
    assert "RECURRENCE-ID;VALUE=DATE:20261013" in edited
    deleted = delete_occurrence(data, "bins", date(2026, 10, 20), NOW)
    assert "EXDATE;VALUE=DATE:20261020" in deleted


@pytest.fixture
def caldav() -> FakeCalDAV:
  return FakeCalDAV()


@pytest_asyncio.fixture
async def editor(caldav: FakeCalDAV) -> AsyncIterator[ICloudEventEditor]:
  async with httpx.AsyncClient(transport=caldav.transport()) as http:
    yield ICloudEventEditor(ICloudCalendarClient(http, "me@icloud.com", "pw"), time_zone=TZ, now=lambda: NOW)


class TestEditor:
  @pytest.mark.asyncio
  async def test_create_never_overwrites(self, caldav: FakeCalDAV, editor: ICloudEventEditor) -> None:
    uid = await editor.create(COLLECTION, changes(title="New", timing=timing(at(7, 9), at(7, 10))))
    method, href, headers = caldav.requests[0]
    assert (method, href, headers["if-none-match"]) == ("PUT", f"{COLLECTION}{uid}.ics", "*")
    assert headers["content-type"].startswith("text/calendar")

  @pytest.mark.asyncio
  async def test_update_occurrence_with_if_match(self, caldav: FakeCalDAV, editor: ICloudEventEditor) -> None:
    etag = caldav.put(HREF, SERIES)
    await editor.update(series_target(12, etag=etag), changes(title="Retro"), EditScope.this)
    put = caldav.requests[-1]
    assert (put[0], put[2]["if-match"]) == ("PUT", etag)
    assert "Retro" in caldav.data(HREF)

  @pytest.mark.asyncio
  async def test_stale_sync_is_a_conflict(self, caldav: FakeCalDAV, editor: ICloudEventEditor) -> None:
    caldav.put(HREF, SERIES)
    with pytest.raises(ProviderConflictError):
      await editor.update(series_target(12, etag='"old"'), changes(title="x"), EditScope.this)
    assert all(method == "GET" for method, _, _ in caldav.requests)

  @pytest.mark.asyncio
  async def test_following_writes_new_series_then_original(self, caldav: FakeCalDAV, editor: ICloudEventEditor) -> None:
    etag = caldav.put(HREF, SERIES)
    new_uid = await editor.update(series_target(26, etag=etag), changes(title="v2"), EditScope.following)
    assert [m for m, _, _ in caldav.requests] == ["GET", "PUT", "PUT"]
    assert f"{COLLECTION}{new_uid}.ics" in caldav.resources
    assert "COUNT=3" in caldav.data(HREF)

  @pytest.mark.asyncio
  async def test_following_rolls_back_when_original_changed(self, caldav: FakeCalDAV, editor: ICloudEventEditor) -> None:
    etag = caldav.put(HREF, SERIES)
    caldav.failures[("PUT", HREF)] = 412
    with pytest.raises(ProviderConflictError):
      await editor.update(series_target(26, etag=etag), changes(title="v2"), EditScope.following)
    assert list(caldav.resources) == [HREF]
    assert caldav.data(HREF) == SERIES

  @pytest.mark.asyncio
  async def test_following_from_first_occurrence_edits_in_place(self, caldav: FakeCalDAV, editor: ICloudEventEditor) -> None:
    etag = caldav.put(HREF, SERIES)
    assert await editor.update(series_target(5, etag=etag), changes(title="All"), EditScope.following) == "standup"
    assert list(caldav.resources) == [HREF]

  @pytest.mark.asyncio
  async def test_move_to_another_calendar(self, caldav: FakeCalDAV, editor: ICloudEventEditor) -> None:
    etag = caldav.put(HREF, SERIES)
    work = "https://p42-caldav.icloud.com/1234/calendars/work/"
    await editor.update(series_target(12, etag=etag), changes(), EditScope.all, destination=work)
    assert list(caldav.resources) == [f"{work}standup.ics"]

  @pytest.mark.asyncio
  async def test_occurrence_cannot_move_calendars(self, caldav: FakeCalDAV, editor: ICloudEventEditor) -> None:
    caldav.put(HREF, SERIES)
    with pytest.raises(UnsupportedEditError):
      await editor.update(series_target(12), changes(), EditScope.this, destination="https://p42-caldav.icloud.com/1234/calendars/work/")

  @pytest.mark.asyncio
  @pytest.mark.parametrize("fields", [{"attendees": ("a@b.com",)}, {"add_conference": True}])
  async def test_guests_and_video_calls_are_google_only(self, caldav: FakeCalDAV, editor: ICloudEventEditor, fields: dict[str, Any]) -> None:
    caldav.put(HREF, SERIES)
    with pytest.raises(UnsupportedEditError):
      await editor.update(series_target(12), changes(**fields), EditScope.all)

  @pytest.mark.asyncio
  async def test_delete_scopes(self, caldav: FakeCalDAV, editor: ICloudEventEditor) -> None:
    etag = caldav.put(HREF, SERIES)
    await editor.delete(series_target(12, etag=etag), EditScope.this)
    assert "EXDATE;TZID=Europe/Stockholm:20261012T090000" in caldav.data(HREF) or "20261012T090000" in caldav.data(HREF)

    etag = caldav.resources[HREF][1]
    await editor.delete(series_target(26, etag=etag), EditScope.following)
    assert [local(e)[0] for e in occurrences(caldav.data(HREF))] == ["10-05 09:00"]

    etag = caldav.resources[HREF][1]
    await editor.delete(series_target(5, etag=etag), EditScope.all)
    assert caldav.resources == {}

  @pytest.mark.asyncio
  async def test_read_only_calendar(self, caldav: FakeCalDAV, editor: ICloudEventEditor) -> None:
    caldav.failures[("PUT", f"{COLLECTION}x.ics")] = 403
    caldav.put(f"{COLLECTION}x.ics", SERIES.replace("UID:standup", "UID:x"))
    target = TargetEvent(COLLECTION, "x", at(5, 9), at(5, 9, 30), resource_href=f"{COLLECTION}x.ics")
    with pytest.raises(ProviderForbiddenError):
      await editor.update(target, changes(title="x"), EditScope.this)
