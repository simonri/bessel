from datetime import UTC, date, datetime
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4

import httpx
import pytest
from api.calendars import google
from api.calendars.google import GoogleCalendarClient, GoogleGrant, _parse_event
from api.calendars.icloud import ICalResource, ICloudCalendarClient, expand_events
from api.calendars.providers import ProviderAttendee, ProviderAuthError, ProviderCalendar, ProviderEvent, html_to_text
from api.calendars.repository import CalendarAccountRepository, CalendarEventRepository, CalendarRepository
from api.calendars.service import AccountSnapshot, OAuthCallbackError, calendar_service
from api.common.encryption import decrypt, encrypt
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.user import User
from api.postgres import AsyncSession
from api.settings import settings
from api.tests.fixtures.base import TEST_USER_INFO
from api.tests.fixtures.database import SaveFixture
from api.worker._enqueue import JobQueueManager
from cryptography.fernet import Fernet
from httpx import AsyncClient
from pytest_mock import MockerFixture
from sqlalchemy import select

WEEK_START = datetime(2026, 10, 5, tzinfo=UTC)
WEEK_END = datetime(2026, 10, 12, tzinfo=UTC)


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture
def google_configured(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "client-id")
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "client-secret")


async def _current_user_id(client: AsyncClient, session: AsyncSession) -> UUID:
  assert (await client.get("/v1/calendars/accounts")).status_code == 200
  return (await session.execute(select(User.id).where(User.auth0_sub == TEST_USER_INFO.sub))).scalar_one()


async def _account(save_fixture: SaveFixture, user_id: UUID, *, email: str = "me@example.com", secret: str = "refresh", sync_error: str | None = None) -> UUID:
  account = CalendarAccount(user_id=user_id, provider=CalendarProvider.google, email=email, encrypted_credentials=encrypt(secret), sync_error=sync_error)
  await save_fixture(account)
  return account.id


async def _apply(session: AsyncSession, account_id: UUID, snapshot: AccountSnapshot) -> CalendarAccount:
  account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
  assert account is not None
  await calendar_service.apply_snapshot(
    CalendarRepository.from_session(session),
    CalendarEventRepository.from_session(session),
    account,
    snapshot,
  )
  await session.flush()
  return account


def _timed(external_id: str, start: datetime, end: datetime, title: str = "Meeting") -> ProviderEvent:
  return ProviderEvent(external_id=external_id, title=title, location=None, all_day=False, start_at=start, end_at=end)


def _all_day(external_id: str, start: date, end: date) -> ProviderEvent:
  return ProviderEvent(external_id=external_id, title="Holiday", location=None, all_day=True, start_date=start, end_date=end)


ICAL = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:standup
DTSTART;TZID=Europe/Stockholm:20261005T090000
DTEND;TZID=Europe/Stockholm:20261005T093000
RRULE:FREQ=DAILY;COUNT=5
EXDATE;TZID=Europe/Stockholm:20261006T090000
SUMMARY:Standup
END:VEVENT
BEGIN:VEVENT
UID:standup
RECURRENCE-ID;TZID=Europe/Stockholm:20261007T090000
DTSTART;TZID=Europe/Stockholm:20261007T110000
DTEND;TZID=Europe/Stockholm:20261007T113000
SUMMARY:Standup (moved)
END:VEVENT
BEGIN:VEVENT
UID:holiday
DTSTART;VALUE=DATE:20261008
SUMMARY:Holiday
LOCATION:Everywhere
END:VEVENT
END:VCALENDAR"""


def _resource(data: str, href: str = "https://p1-caldav.icloud.com/1/calendars/home/a.ics") -> ICalResource:
  return ICalResource(href=href, etag='"etag-1"', data=data)


class TestExpandICalEvents:
  def test_recurrence_exdate_and_override(self) -> None:
    events = {e.external_id: e for e in expand_events([_resource(ICAL)], WEEK_START, WEEK_END)}
    standups = sorted((e for e in events.values() if not e.all_day), key=lambda e: e.start_at or WEEK_START)

    assert [e.title for e in standups] == ["Standup", "Standup (moved)", "Standup", "Standup"]
    assert [e.start_at.astimezone(UTC).hour for e in standups if e.start_at] == [7, 9, 7, 7]
    assert len({e.external_id for e in standups}) == 4

  def test_all_day_without_dtend_lasts_one_day(self) -> None:
    holiday = next(e for e in expand_events([_resource(ICAL)], WEEK_START, WEEK_END) if e.all_day)
    assert (holiday.start_date, holiday.end_date, holiday.location) == (date(2026, 10, 8), date(2026, 10, 9), "Everywhere")

  def test_occurrences_outside_window_dropped(self) -> None:
    assert expand_events([_resource(ICAL)], datetime(2026, 11, 1, tzinfo=UTC), datetime(2026, 11, 8, tzinfo=UTC)) == []


def _multistatus(*responses: str) -> str:
  return f'<?xml version="1.0"?><d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/">{"".join(responses)}</d:multistatus>'


def _response(href: str, prop: str, status: str = "HTTP/1.1 200 OK") -> str:
  return f"<d:response><d:href>{href}</d:href><d:propstat><d:prop>{prop}</d:prop><d:status>{status}</d:status></d:propstat></d:response>"


def _calendar_props(name: str, component: str, extra: str = "") -> str:
  resourcetype = "<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>"
  components = f'<c:supported-calendar-component-set><c:comp name="{component}"/></c:supported-calendar-component-set>'
  return f"{resourcetype}<d:displayname>{name}</d:displayname>{extra}{components}"


ICLOUD_HOME = "https://p42-caldav.icloud.com/1234/calendars/"


def _icloud_handler(request: httpx.Request) -> httpx.Response:
  if request.headers.get("Authorization") != httpx.BasicAuth("me@icloud.com", "app-pw")._auth_header:
    return httpx.Response(401)
  url, body = str(request.url), request.content.decode()
  if request.method == "PROPFIND" and url == "https://caldav.icloud.com/":
    return httpx.Response(207, text=_multistatus(_response("/", "<d:current-user-principal><d:href>/1234/principal/</d:href></d:current-user-principal>")))
  if request.method == "PROPFIND" and url == "https://caldav.icloud.com/1234/principal/":
    return httpx.Response(207, text=_multistatus(_response("/1234/principal/", f"<c:calendar-home-set><d:href>{ICLOUD_HOME}</d:href></c:calendar-home-set>")))
  if request.method == "PROPFIND" and url == ICLOUD_HOME:
    assert request.headers["Depth"] == "1"
    return httpx.Response(
      207,
      text=_multistatus(
        _response("/1234/calendars/", "<d:resourcetype><d:collection/></d:resourcetype>"),
        _response(
          "/1234/calendars/home/",
          _calendar_props(
            "Home", "VEVENT", '<a:calendar-color>#34AADCFF</a:calendar-color><cs:getctag xmlns:cs="http://calendarserver.org/ns/">ctag-1</cs:getctag>'
          ),
        ),
        _response(
          "/1234/calendars/reminders/",
          _calendar_props("Reminders", "VTODO"),
        ),
      ),
    )
  if request.method == "REPORT" and url == f"{ICLOUD_HOME}home/":
    assert '<c:time-range start="20261005T000000Z" end="20261012T000000Z"/>' in body
    return httpx.Response(207, text=_multistatus(_response("/1234/calendars/home/a.ics", f"<c:calendar-data>{ICAL}</c:calendar-data>")))
  return httpx.Response(404)


class TestICloudClient:
  @pytest.mark.asyncio
  async def test_discovers_event_calendars_and_events(self) -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(_icloud_handler)) as http:
      icloud = ICloudCalendarClient(http, "me@icloud.com", "app-pw")
      calendars = await icloud.list_calendars()
      events = await icloud.list_events(calendars[0].external_id, WEEK_START, WEEK_END)

    assert calendars == [ProviderCalendar(external_id=f"{ICLOUD_HOME}home/", name="Home", color="#34aadc", change_tag="ctag-1")]
    assert sorted(e.title for e in events) == ["Holiday", "Standup", "Standup", "Standup", "Standup (moved)"]

  @pytest.mark.asyncio
  async def test_rejected_credentials_raise_auth_error(self) -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(_icloud_handler)) as http:
      with pytest.raises(ProviderAuthError):
        await ICloudCalendarClient(http, "me@icloud.com", "wrong").list_calendars()


DETAILED_ICAL = """BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:planning
DTSTART:20261006T130000Z
DTEND:20261006T140000Z
RRULE:FREQ=WEEKLY;COUNT=2
SUMMARY:Planning
LOCATION:https://acme.zoom.us/j/123?pwd=abc
DESCRIPTION:Agenda in the doc
ORGANIZER;CN=Bob:MAILTO:bob@example.com
ATTENDEE;CN=Al;PARTSTAT=ACCEPTED:mailto:al@example.com
ATTENDEE;PARTSTAT=DECLINED:mailto:cy@example.com
TRANSP:TRANSPARENT
CLASS:PRIVATE
END:VEVENT
BEGIN:VEVENT
UID:solo
DTSTART:20261007T090000Z
DTEND:20261007T100000Z
ATTENDEE;CN=Al:mailto:al@example.com
SUMMARY:Solo
END:VEVENT
END:VCALENDAR"""


class TestEventDetails:
  def test_ical_details(self) -> None:
    events = {e.title: e for e in expand_events([_resource(DETAILED_ICAL)], WEEK_START, WEEK_END)}
    planning, solo = events["Planning"], events["Solo"]

    assert (planning.creator_name, planning.creator_email) == ("Bob", "bob@example.com")
    assert planning.attendees == [
      ProviderAttendee(email="al@example.com", name="Al", response="accepted"),
      ProviderAttendee(email="cy@example.com", name=None, response="declined"),
    ]
    assert planning.conference_url == "https://acme.zoom.us/j/123?pwd=abc"
    assert (planning.busy, planning.recurring, planning.visibility, planning.description) == (False, True, "private", "Agenda in the doc")
    assert solo.attendees == [ProviderAttendee(email="al@example.com", name="Al", response="needs_action")]
    assert (solo.busy, solo.recurring, solo.conference_url) == (True, False, None)

  def test_ical_override_counts_as_recurring(self) -> None:
    moved = next(e for e in expand_events([_resource(ICAL)], WEEK_START, WEEK_END) if e.title == "Standup (moved)")
    assert moved.recurring

  def test_google_details(self) -> None:
    event = _parse_event(
      {
        "id": "e1",
        "summary": "Linser Simme",
        "start": {"dateTime": "2026-10-07T17:00:00+02:00"},
        "end": {"dateTime": "2026-10-07T18:00:00+02:00"},
        "creator": {"email": "suseson@gmail.com"},
        "organizer": {"email": "family@group.calendar.google.com", "displayName": "Familjen"},
        "description": "Bring towel<br>Pool 2<br><a href=\"https://example.com/x\">Schedule</a>",
        "attendees": [
          {"email": "me@gmail.com", "responseStatus": "tentative", "self": True},
          {"email": "room@resource.calendar.google.com", "resource": True, "responseStatus": "accepted"},
        ],
        "conferenceData": {"entryPoints": [{"entryPointType": "phone", "uri": "tel:+1"}, {"entryPointType": "video", "uri": "https://meet.google.com/abc"}]},
        "htmlLink": "https://www.google.com/calendar/event?eid=x",
        "transparency": "transparent",
        "recurringEventId": "series",
        "visibility": "default",
      }
    )

    assert event is not None
    assert (event.creator_name, event.creator_email) == (None, "suseson@gmail.com")
    assert event.description == "Bring towel\nPool 2\nSchedule (https://example.com/x)"
    assert event.attendees == [ProviderAttendee(email="me@gmail.com", name=None, response="tentative", is_self=True)]
    assert event.conference_url == "https://meet.google.com/abc"
    assert (event.busy, event.recurring, event.visibility) == (False, True, None)

  def test_google_conference_falls_back_to_links_in_text(self) -> None:
    base = {"id": "e", "start": {"date": "2026-10-07"}, "end": {"date": "2026-10-08"}}
    assert _parse_event({**base, "hangoutLink": "https://meet.google.com/h"}).conference_url == "https://meet.google.com/h"  # type: ignore[union-attr]
    assert _parse_event({**base, "description": "Join: https://acme.zoom.us/j/9 thanks"}).conference_url == "https://acme.zoom.us/j/9"  # type: ignore[union-attr]

  def test_html_to_text_leaves_plain_text_alone(self) -> None:
    assert html_to_text("a < b\nnext") == "a < b\nnext"
    assert html_to_text("") is None


class TestGoogleClient:
  @pytest.mark.asyncio
  async def test_list_calendars_paginates_and_maps(self, google_configured: None) -> None:
    pages = [
      {"items": [{"id": "primary", "summary": "Privat", "backgroundColor": "#16A765", "selected": True}], "nextPageToken": "p2"},
      {"items": [{"id": "holidays", "summary": "Holidays", "summaryOverride": "Helgdagar"}, {"id": "gone", "deleted": True}]},
    ]

    def handler(request: httpx.Request) -> httpx.Response:
      return httpx.Response(200, json=pages[1 if request.url.params.get("pageToken") == "p2" else 0])

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
      calendars = await GoogleCalendarClient(http).list_calendars("token")

    assert calendars == [
      ProviderCalendar(external_id="primary", name="Privat", color="#16a765", hidden_by_default=False),
      ProviderCalendar(external_id="holidays", name="Helgdagar", color=google.DEFAULT_COLOR, hidden_by_default=True),
    ]

  @pytest.mark.asyncio
  async def test_list_events_maps_timed_all_day_and_cancelled(self) -> None:
    seen_paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
      seen_paths.append(request.url.raw_path.decode())
      return httpx.Response(
        200,
        json={
          "items": [
            {"id": "a", "summary": "Sync", "start": {"dateTime": "2026-10-05T09:00:00+02:00"}, "end": {"dateTime": "2026-10-05T10:00:00+02:00"}},
            {"id": "b", "start": {"date": "2026-10-06"}, "end": {"date": "2026-10-08"}},
            {"id": "c", "status": "cancelled"},
          ]
        },
      )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
      events = await GoogleCalendarClient(http).list_events("token", "#holiday@group.v.calendar.google.com", WEEK_START, WEEK_END)

    assert seen_paths[0].startswith("/calendar/v3/calendars/%23holiday%40group.v.calendar.google.com/events")
    assert [(e.external_id, e.title, e.all_day) for e in events] == [("a", "Sync", False), ("b", "(No title)", True)]
    assert events[1].end_date == date(2026, 10, 8)

  @pytest.mark.asyncio
  async def test_invalid_grant_raises_auth_error(self, google_configured: None) -> None:
    transport = httpx.MockTransport(lambda _: httpx.Response(400, json={"error": "invalid_grant"}))
    async with httpx.AsyncClient(transport=transport) as http:
      with pytest.raises(ProviderAuthError):
        await GoogleCalendarClient(http).refresh_access_token("revoked")


class TestGoogleConnect:
  @pytest.mark.asyncio
  async def test_authorize_requires_configuration(self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "")
    resp = await client.post("/v1/calendars/google/authorize")
    assert resp.status_code == 503

  @pytest.mark.asyncio
  async def test_authorize_url_requests_offline_access(self, client: AsyncClient, google_configured: None) -> None:
    resp = await client.post("/v1/calendars/google/authorize")
    assert resp.status_code == 200
    params = parse_qs(urlparse(resp.json()["url"]).query)
    assert params["access_type"] == ["offline"]
    assert params["prompt"] == ["consent"]
    assert params["redirect_uri"] == [f"{settings.FRONTEND_BASE_URL}/oauth/google-calendar"]
    assert params["state"][0]

  @pytest.mark.asyncio
  async def test_callback_creates_account_and_enqueues_sync(
    self, client: AsyncClient, session: AsyncSession, google_configured: None, job_queue_manager: JobQueueManager, mocker: MockerFixture
  ) -> None:
    mocker.patch.object(GoogleCalendarClient, "exchange_code", return_value=GoogleGrant("access", "refresh-secret", can_write=True))
    mocker.patch.object(GoogleCalendarClient, "get_email", return_value="me@gmail.com")
    state = parse_qs(urlparse((await client.post("/v1/calendars/google/authorize")).json()["url"]).query)["state"][0]

    resp = await client.post("/v1/calendars/google/callback", json={"code": "c", "state": state})

    assert resp.status_code == 201
    assert resp.json()["email"] == "me@gmail.com"
    account = (await session.execute(select(CalendarAccount))).scalar_one()
    assert account.email == "me@gmail.com"
    assert "refresh-secret" not in account.encrypted_credentials
    assert decrypt(account.encrypted_credentials) == "refresh-secret"
    assert [job[:2] for job in job_queue_manager._enqueued_jobs] == [("sync_calendar_account", (str(account.id),))]

  @pytest.mark.asyncio
  async def test_reconnect_without_refresh_token_keeps_credentials(
    self,
    client: AsyncClient,
    session: AsyncSession,
    save_fixture: SaveFixture,
    google_configured: None,
    job_queue_manager: JobQueueManager,
    mocker: MockerFixture,
  ) -> None:
    account_id = await _account(
      save_fixture, await _current_user_id(client, session), email="me@gmail.com", secret="old-refresh", sync_error="Reconnect the account."
    )
    mocker.patch.object(GoogleCalendarClient, "exchange_code", return_value=GoogleGrant("access", None, can_write=False))
    mocker.patch.object(GoogleCalendarClient, "get_email", return_value="me@gmail.com")
    state = parse_qs(urlparse((await client.post("/v1/calendars/google/authorize")).json()["url"]).query)["state"][0]

    resp = await client.post("/v1/calendars/google/callback", json={"code": "c", "state": state})

    assert resp.status_code == 201
    account = await CalendarAccountRepository.from_session(session).get_by_id(account_id)
    assert account is not None
    assert decrypt(account.encrypted_credentials) == "old-refresh"
    assert account.sync_error is None

  @pytest.mark.asyncio
  async def test_callback_rejects_tampered_state(self, client: AsyncClient, google_configured: None) -> None:
    resp = await client.post("/v1/calendars/google/callback", json={"code": "c", "state": "forged"})
    assert resp.status_code == 400
    assert "expired" in resp.text

  @pytest.mark.asyncio
  async def test_callback_rejects_state_from_another_user(self, session: AsyncSession, google_configured: None, mocker: MockerFixture) -> None:
    exchange = mocker.patch.object(GoogleCalendarClient, "exchange_code")
    state = parse_qs(urlparse(calendar_service.google_authorize_url(uuid4())).query)["state"][0]

    with pytest.raises(OAuthCallbackError, match="different Bessel account"):
      await calendar_service.complete_google_connect(CalendarAccountRepository.from_session(session), uuid4(), code="c", state=state)

    exchange.assert_not_called()
    assert (await session.execute(select(CalendarAccount))).scalar_one_or_none() is None


class TestICloudConnect:
  @pytest.mark.asyncio
  async def test_connect_validates_and_never_returns_credentials(self, client: AsyncClient, job_queue_manager: JobQueueManager, mocker: MockerFixture) -> None:
    mocker.patch.object(ICloudCalendarClient, "list_calendars", return_value=[])

    resp = await client.post("/v1/calendars/icloud", json={"apple_id": "me@icloud.com", "app_password": "abcd-efgh-ijkl-mnop"})

    assert resp.status_code == 201
    body = resp.json()
    assert body["provider"] == "icloud"
    assert body["email"] == "me@icloud.com"
    assert "abcd-efgh-ijkl-mnop" not in resp.text
    assert "credentials" not in str(body.keys())

  @pytest.mark.asyncio
  async def test_rejected_credentials(self, client: AsyncClient, mocker: MockerFixture) -> None:
    mocker.patch.object(ICloudCalendarClient, "list_calendars", side_effect=ProviderAuthError("nope"))
    resp = await client.post("/v1/calendars/icloud", json={"apple_id": "me@icloud.com", "app_password": "wrong"})
    assert resp.status_code == 422


class TestSyncAndEvents:
  @pytest.mark.asyncio
  async def test_resync_mirrors_provider_and_keeps_hidden(self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture) -> None:
    account_id = await _account(save_fixture, await _current_user_id(client, session))
    await _apply(
      session,
      account_id,
      AccountSnapshot(
        calendars=[ProviderCalendar("work", "Work", "#ff0000"), ProviderCalendar("old", "Old", "#00ff00")],
        events={
          "work": [_timed("w1", datetime(2026, 10, 6, 9, tzinfo=UTC), datetime(2026, 10, 6, 10, tzinfo=UTC)), _timed("w2", WEEK_START, WEEK_START)],
          "old": [],
        },
      ),
    )
    work_id = next(c["id"] for c in (await client.get("/v1/calendars/accounts")).json()["accounts"][0]["calendars"] if c["name"] == "Work")
    assert (await client.patch(f"/v1/calendars/{work_id}", json={"hidden": True})).status_code == 200

    account = await _apply(
      session,
      account_id,
      AccountSnapshot(
        calendars=[ProviderCalendar("work", "Work (renamed)", "#0000ff", hidden_by_default=False)],
        events={
          "work": [
            ProviderEvent(
              external_id="w1",
              title="Moved",
              location=None,
              all_day=False,
              start_at=datetime(2026, 10, 6, 11, tzinfo=UTC),
              end_at=datetime(2026, 10, 6, 12, tzinfo=UTC),
              description="Now with notes",
              attendees=[ProviderAttendee(email="al@example.com", name="Al", response="accepted")],
              busy=False,
            )
          ]
        },
      ),
    )

    calendars = (await client.get("/v1/calendars/accounts")).json()["accounts"][0]["calendars"]
    assert [(c["id"], c["name"], c["color"], c["hidden"]) for c in calendars] == [(work_id, "Work (renamed)", "#0000ff", True)]
    events = (await client.get("/v1/calendars/events", params={"start_ts": int(WEEK_START.timestamp()), "end_ts": int(WEEK_END.timestamp())})).json()["events"]
    assert [(e["title"], e["start_at"], e["description"], e["busy"]) for e in events] == [("Moved", "2026-10-06T11:00:00Z", "Now with notes", False)]
    assert events[0]["attendees"] == [
      {"email": "al@example.com", "name": "Al", "response": "accepted", "is_self": False, "is_organizer": False, "photo_url": None}
    ]
    assert account.last_synced_at is not None

  @pytest.mark.asyncio
  async def test_events_in_range(self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture) -> None:
    account_id = await _account(save_fixture, await _current_user_id(client, session))
    await _apply(
      session,
      account_id,
      AccountSnapshot(
        calendars=[ProviderCalendar("c", "Cal", "#ff0000")],
        events={
          "c": [
            _timed("spans-start", datetime(2026, 10, 4, 23, tzinfo=UTC), datetime(2026, 10, 5, 1, tzinfo=UTC)),
            _timed("before", datetime(2026, 10, 4, 9, tzinfo=UTC), datetime(2026, 10, 4, 10, tzinfo=UTC)),
            _all_day("holiday", date(2026, 10, 8), date(2026, 10, 9)),
            _all_day("next-month", date(2026, 11, 8), date(2026, 11, 9)),
          ]
        },
      ),
    )

    resp = await client.get("/v1/calendars/events", params={"start_ts": int(WEEK_START.timestamp()), "end_ts": int(WEEK_END.timestamp())})

    assert resp.status_code == 200
    events = {e["title"] if e["all_day"] else e["start_at"]: e for e in resp.json()["events"]}
    assert set(events) == {"2026-10-04T23:00:00Z", "Holiday"}
    assert (events["Holiday"]["start_date"], events["Holiday"]["end_date"]) == ("2026-10-08", "2026-10-09")

  @pytest.mark.asyncio
  @pytest.mark.parametrize("span", [0, 63 * 86400])
  async def test_event_window_validated(self, client: AsyncClient, span: int) -> None:
    start = int(WEEK_START.timestamp())
    resp = await client.get("/v1/calendars/events", params={"start_ts": start, "end_ts": start + span})
    assert resp.status_code == 422


class TestOwnership:
  @pytest.mark.asyncio
  async def test_other_users_data_is_invisible(self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture) -> None:
    other = User(auth0_sub="auth0|other-user", email="other@example.com")
    await save_fixture(other)
    account_id = await _account(save_fixture, other.id)
    await _apply(
      session,
      account_id,
      AccountSnapshot(calendars=[ProviderCalendar("c", "Theirs", "#ff0000")], events={"c": [_timed("e", WEEK_START, WEEK_END)]}),
    )
    calendar_id = (await CalendarAccountRepository.from_session(session).list_for_user(other.id))[0].calendars[0].id

    assert (await client.get("/v1/calendars/accounts")).json()["accounts"] == []
    assert (await client.get("/v1/calendars/events", params={"start_ts": int(WEEK_START.timestamp()), "end_ts": int(WEEK_END.timestamp())})).json()[
      "events"
    ] == []
    assert (await client.patch(f"/v1/calendars/{calendar_id}", json={"hidden": True})).status_code == 404
    assert (await client.delete(f"/v1/calendars/accounts/{account_id}")).status_code == 404
    assert (await client.post(f"/v1/calendars/accounts/{account_id}/sync")).status_code == 404

  @pytest.mark.asyncio
  async def test_disconnect_removes_calendars_and_events(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, mocker: MockerFixture
  ) -> None:
    revoke = mocker.patch.object(GoogleCalendarClient, "revoke")
    account_id = await _account(save_fixture, await _current_user_id(client, session), secret="refresh-token")
    await _apply(session, account_id, AccountSnapshot(calendars=[ProviderCalendar("c", "Cal", "#ff0000")], events={"c": [_timed("e", WEEK_START, WEEK_END)]}))

    resp = await client.delete(f"/v1/calendars/accounts/{account_id}")

    assert resp.status_code == 204
    revoke.assert_awaited_once_with("refresh-token")
    assert (await client.get("/v1/calendars/accounts")).json()["accounts"] == []
    events = (await client.get("/v1/calendars/events", params={"start_ts": int(WEEK_START.timestamp()), "end_ts": int(WEEK_END.timestamp())})).json()
    assert events["events"] == []
