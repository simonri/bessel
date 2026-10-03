from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from api.calendars.google import WRITE_SCOPE, GoogleCalendarClient, _parse_event
from api.calendars.icloud import ICalResource, ICloudCalendarClient, expand_events
from api.calendars.providers import ProviderCalendar
from api.settings import settings

WEEK_START = datetime(2026, 10, 5, tzinfo=UTC)
WEEK_END = datetime(2026, 10, 12, tzinfo=UTC)


def _google_item(**overrides: Any) -> dict[str, Any]:
  return {
    "id": "evt",
    "etag": '"3181"',
    "summary": "Sync",
    "start": {"dateTime": "2026-10-06T09:00:00+02:00"},
    "end": {"dateTime": "2026-10-06T10:00:00+02:00"},
    "organizer": {"email": "me@gmail.com", "self": True},
    **overrides,
  }


class TestGoogleEventEditability:
  @pytest.mark.parametrize(
    ("overrides", "editable"),
    [
      ({}, True),
      ({"organizer": {"email": "boss@corp.com"}}, False),
      ({"organizer": {"email": "boss@corp.com"}, "guestsCanModify": True}, True),
      ({"eventType": "fromGmail"}, False),
      ({"eventType": "birthday"}, False),
      ({"eventType": "focusTime"}, False),
      ({"locked": True}, False),
      ({"organizer": {}}, True),
    ],
  )
  def test_editable(self, overrides: dict[str, Any], editable: bool) -> None:
    event = _parse_event(_google_item(**overrides))
    assert event is not None
    assert event.editable is editable

  def test_series_fields_and_etag(self) -> None:
    event = _parse_event(
      _google_item(
        id="series_20261006T070000Z",
        recurringEventId="series",
        originalStartTime={"dateTime": "2026-10-06T09:00:00+02:00", "timeZone": "Europe/Stockholm"},
      )
    )
    assert event is not None
    assert (event.series_id, event.original_start, event.etag) == ("series", "2026-10-06T09:00:00+02:00", '"3181"')

  def test_all_day_original_start_is_a_date(self) -> None:
    event = _parse_event(
      _google_item(
        start={"date": "2026-10-06"},
        end={"date": "2026-10-07"},
        recurringEventId="series",
        originalStartTime={"date": "2026-10-06"},
      )
    )
    assert event is not None
    assert event.original_start == "2026-10-06"

  def test_single_event_has_no_series(self) -> None:
    event = _parse_event(_google_item())
    assert event is not None
    assert (event.series_id, event.original_start, event.recurring) == (None, None, False)


class TestGoogleMyResponse:
  @pytest.mark.parametrize(
    ("attendees", "expected"),
    [
      ([], None),
      ([{"email": "boss@corp.com", "responseStatus": "accepted"}], None),
      ([{"email": "me@gmail.com", "self": True, "responseStatus": "needsAction"}], "needs_action"),
      ([{"email": "me@gmail.com", "self": True, "responseStatus": "tentative"}], "tentative"),
      ([{"email": "me@gmail.com", "self": True}], "needs_action"),
    ],
    ids=["no-guests", "not-invited", "unanswered", "maybe", "missing-status"],
  )
  def test_reads_the_self_attendee(self, attendees: list[dict[str, Any]], expected: str | None) -> None:
    event = _parse_event(_google_item(attendees=attendees))
    assert event is not None and event.my_response == expected


class TestGoogleCalendarAccess:
  @pytest.mark.asyncio
  async def test_writable_and_primary_from_access_role(self) -> None:
    items = [
      {"id": "me@gmail.com", "summary": "Me", "accessRole": "owner", "primary": True, "selected": True},
      {"id": "shared", "summary": "Shared", "accessRole": "writer", "selected": True},
      {"id": "holidays", "summary": "Holidays", "accessRole": "reader", "selected": True},
      {"id": "busy", "summary": "Busy", "accessRole": "freeBusyReader", "selected": True},
    ]
    transport = httpx.MockTransport(lambda _: httpx.Response(200, json={"items": items}))
    async with httpx.AsyncClient(transport=transport) as http:
      calendars = await GoogleCalendarClient(http).list_calendars("token")

    assert [(c.external_id, c.writable, c.primary) for c in calendars] == [
      ("me@gmail.com", True, True),
      ("shared", True, False),
      ("holidays", False, False),
      ("busy", False, False),
    ]

  @pytest.mark.asyncio
  @pytest.mark.parametrize(
    ("scope", "can_write"),
    [
      (f"openid email https://www.googleapis.com/auth/calendar.readonly {WRITE_SCOPE}", True),
      # The user unticked "edit events" on Google's granular consent screen.
      ("openid email https://www.googleapis.com/auth/calendar.readonly", False),
    ],
  )
  async def test_grant_reports_write_scope(self, monkeypatch: pytest.MonkeyPatch, scope: str, can_write: bool) -> None:
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "id")
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "secret")
    transport = httpx.MockTransport(lambda _: httpx.Response(200, json={"access_token": "a", "refresh_token": "r", "scope": scope}))
    async with httpx.AsyncClient(transport=transport) as http:
      grant = await GoogleCalendarClient(http).exchange_code("code")
    assert (grant.access_token, grant.refresh_token, grant.can_write) == ("a", "r", can_write)


ICAL = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:single
DTSTART:20261006T090000Z
DTEND:20261006T100000Z
SUMMARY:Mine
END:VEVENT
BEGIN:VEVENT
UID:invite
DTSTART:20261007T090000Z
DTEND:20261007T100000Z
SUMMARY:Their meeting
ORGANIZER:mailto:boss@corp.com
ATTENDEE;PARTSTAT=ACCEPTED:mailto:boss@corp.com
ATTENDEE;PARTSTAT=NEEDS-ACTION:mailto:Me@Risberg.eu
END:VEVENT
BEGIN:VEVENT
UID:alias
DTSTART:20261008T090000Z
DTEND:20261008T100000Z
SUMMARY:Organized from my alias
ORGANIZER;CN=Me:MAILTO:Me@iCloud.com
END:VEVENT
BEGIN:VEVENT
UID:series
DTSTART;TZID=Europe/Stockholm:20261005T080000
DTEND;TZID=Europe/Stockholm:20261005T083000
RRULE:FREQ=DAILY;COUNT=2
SUMMARY:Standup
END:VEVENT
END:VCALENDAR"""


class TestICloudSyncFields:
  def _expand(self) -> list[Any]:
    resource = ICalResource(href="https://p1-caldav.icloud.com/1/calendars/home/a.ics", etag='"e1"', data=ICAL)
    return expand_events([resource], WEEK_START, WEEK_END, frozenset({"me@risberg.eu", "me@icloud.com"}))

  def _events(self) -> dict[str, Any]:
    return {e.title: e for e in self._expand() if e.title != "Standup"}

  def test_single_event_keyed_by_uid(self) -> None:
    mine = self._events()["Mine"]
    assert (mine.external_id, mine.series_id, mine.original_start, mine.recurring) == ("single", None, None, False)
    assert (mine.etag, mine.resource_href) == ('"e1"', "https://p1-caldav.icloud.com/1/calendars/home/a.ics")

  def test_editable_unless_someone_else_organizes(self) -> None:
    events = self._events()
    assert events["Mine"].editable
    assert not events["Their meeting"].editable
    assert events["Organized from my alias"].editable

  def test_my_response_from_any_owner_address(self) -> None:
    events = self._events()
    assert events["Their meeting"].my_response == "needs_action"
    assert events["Mine"].my_response is None

  def test_series_occurrences(self) -> None:
    standups = sorted((e for e in self._expand() if e.title == "Standup"), key=lambda e: e.external_id)
    assert [e.external_id for e in standups] == ["series/2026-10-05T08:00:00+02:00", "series/2026-10-06T08:00:00+02:00"]
    assert {e.series_id for e in standups} == {"series"}
    assert [e.original_start for e in standups] == ["2026-10-05T08:00:00+02:00", "2026-10-06T08:00:00+02:00"]


HOME = "https://p42-caldav.icloud.com/1234/calendars/"


def _multistatus(*responses: str) -> str:
  return f'<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">{"".join(responses)}</d:multistatus>'


def _response(href: str, prop: str) -> str:
  return f"<d:response><d:href>{href}</d:href><d:propstat><d:prop>{prop}</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>"


def _calendar(name: str, privileges: str) -> str:
  return "".join(
    [
      "<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>",
      f"<d:displayname>{name}</d:displayname>",
      '<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>',
      f"<d:current-user-privilege-set>{privileges}</d:current-user-privilege-set>",
    ]
  )


def _handler(request: httpx.Request) -> httpx.Response:
  url = str(request.url)
  if url == "https://caldav.icloud.com/":
    return httpx.Response(207, text=_multistatus(_response("/", "<d:current-user-principal><d:href>/1234/principal/</d:href></d:current-user-principal>")))
  if url == "https://caldav.icloud.com/1234/principal/":
    addresses = "<d:href>mailto:me@icloud.com</d:href><d:href>/1234/principal/</d:href>"
    prop = f"<c:calendar-home-set><d:href>{HOME}</d:href></c:calendar-home-set><c:calendar-user-address-set>{addresses}</c:calendar-user-address-set>"
    return httpx.Response(207, text=_multistatus(_response("/1234/principal/", prop)))
  if url == HOME and request.method == "PROPFIND":
    return httpx.Response(
      207,
      text=_multistatus(
        _response("/1234/calendars/home/", _calendar("Home", "<d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege>")),
        _response("/1234/calendars/shared/", _calendar("Shared with me", "<d:privilege><d:read/></d:privilege>")),
      ),
    )
  if request.method == "REPORT":
    assert "<d:getetag/>" in request.content.decode()
    resource = _response("/1234/calendars/home/a.ics", f'<d:getetag>"e9"</d:getetag><c:calendar-data>{ICAL}</c:calendar-data>')
    return httpx.Response(207, text=_multistatus(_response("/1234/calendars/home/", ""), resource))
  return httpx.Response(404)


class TestICloudClientCapture:
  @pytest.mark.asyncio
  async def test_calendars_report_write_privilege(self) -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(_handler)) as http:
      calendars = await ICloudCalendarClient(http, "me@risberg.eu", "pw").list_calendars()
    assert calendars == [
      ProviderCalendar(external_id=f"{HOME}home/", name="Home", color="#34aadc", writable=True),
      ProviderCalendar(external_id=f"{HOME}shared/", name="Shared with me", color="#34aadc", writable=False),
    ]

  @pytest.mark.asyncio
  async def test_events_carry_resource_href_etag_and_owner_aliases(self) -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(_handler)) as http:
      events = {e.title: e for e in await ICloudCalendarClient(http, "me@risberg.eu", "pw").list_events(f"{HOME}home/", WEEK_START, WEEK_END)}
    assert events["Mine"].resource_href == f"{HOME}home/a.ics"
    assert events["Mine"].etag == '"e9"'
    # me@icloud.com came from calendar-user-address-set, not the login.
    assert events["Organized from my alias"].editable
    assert not events["Their meeting"].editable
