from collections.abc import AsyncIterator, Iterator
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx
import pytest
import pytest_asyncio
from api.app import app as api_app
from api.calendars import editing
from api.calendars import http as provider_http
from api.calendars.google import GoogleCalendarClient
from api.calendars.icloud import ICloudCalendarClient
from api.calendars.locks import account_lock
from api.calendars.repository import CalendarEventRepository
from api.common.encryption import encrypt
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.user import User
from api.postgres import AsyncSession
from api.redis import Redis, create_redis, get_redis
from api.settings import settings
from api.tests.calendar_fakes import CALDAV_HOME, FakeCalDAV, FakeGoogleCalendar
from api.tests.fixtures.base import TEST_USER_INFO
from api.tests.fixtures.database import SaveFixture
from api.worker._enqueue import JobQueueManager
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select

TZ = "Europe/Stockholm"
PRIMARY = "me@gmail.com"
ICLOUD_HOME = f"{CALDAV_HOME}home/"


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "id")
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "secret")


@pytest_asyncio.fixture
async def redis() -> AsyncIterator[Redis]:
  client = create_redis("script")
  api_app.dependency_overrides[get_redis] = lambda: client
  yield client
  api_app.dependency_overrides.pop(get_redis)
  await client.aclose()


@pytest.fixture
def google() -> FakeGoogleCalendar:
  return FakeGoogleCalendar()


@pytest.fixture
def caldav() -> FakeCalDAV:
  return FakeCalDAV()


@pytest.fixture(autouse=True)
def providers(monkeypatch: pytest.MonkeyPatch, google: FakeGoogleCalendar, caldav: FakeCalDAV) -> Iterator[None]:
  google_transport, caldav_transport = google.transport(), caldav.transport()

  async def route(request: httpx.Request) -> httpx.Response:
    transport = caldav_transport if "icloud.com" in request.url.host else google_transport
    return await transport.handle_async_request(request)

  monkeypatch.setattr(provider_http, "client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(route)))
  yield


class Seed:
  def __init__(self, session: AsyncSession, save_fixture: SaveFixture, user_id: UUID) -> None:
    self.session = session
    self.save_fixture = save_fixture
    self.user_id = user_id

  async def account(self, provider: CalendarProvider = CalendarProvider.google, *, can_write: bool = True, user_id: UUID | None = None) -> CalendarAccount:
    account = CalendarAccount(
      user_id=user_id or self.user_id,
      provider=provider,
      email="me@icloud.com" if provider == CalendarProvider.icloud else PRIMARY,
      encrypted_credentials=encrypt("secret"),
      can_write=can_write,
    )
    await self.save_fixture(account)
    return account

  async def calendar(self, account: CalendarAccount, external_id: str, *, writable: bool = True) -> Calendar:
    calendar = Calendar(account_id=account.id, external_id=external_id, name=external_id, color="#4285f4", writable=writable)
    await self.save_fixture(calendar)
    return calendar

  async def sync_google(self, calendar: Calendar) -> list[CalendarEvent]:
    async with provider_http.client() as http:
      events = await GoogleCalendarClient(http).list_events("token", calendar.external_id, datetime(2026, 1, 1, tzinfo=UTC), datetime(2027, 1, 1, tzinfo=UTC))
    return await self._store(calendar, events)

  async def sync_icloud(self, calendar: Calendar) -> list[CalendarEvent]:
    async with provider_http.client() as http:
      events = await ICloudCalendarClient(http, "me@icloud.com", "secret").list_events(
        calendar.external_id, datetime(2026, 1, 1, tzinfo=UTC), datetime(2027, 1, 1, tzinfo=UTC)
      )
    return await self._store(calendar, events)

  async def _store(self, calendar: Calendar, events: list[Any]) -> list[CalendarEvent]:
    await CalendarEventRepository.from_session(self.session).replace_for_calendar(calendar, events)
    await self.session.flush()
    rows = await self.session.execute(select(CalendarEvent).where(CalendarEvent.calendar_id == calendar.id).execution_options(populate_existing=True))
    return list(rows.scalars().all())


@pytest_asyncio.fixture
async def seed(client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture) -> Seed:
  assert (await client.get("/v1/calendars/accounts")).status_code == 200
  user_id = (await session.execute(select(User.id).where(User.auth0_sub == TEST_USER_INFO.sub))).scalar_one()
  return Seed(session, save_fixture, user_id)


def timed(start: str, end: str) -> dict[str, Any]:
  return {"start": {"date_time": start}, "end": {"date_time": end}, "time_zone": TZ}


def body(**fields: Any) -> dict[str, Any]:
  return {"time_zone": TZ, **fields}


def google_event(event_id: str, **fields: Any) -> dict[str, Any]:
  return {
    "id": event_id,
    "summary": "Planning",
    "start": {"dateTime": "2026-10-07T09:00:00+02:00"},
    "end": {"dateTime": "2026-10-07T10:00:00+02:00"},
    "organizer": {"email": PRIMARY, "self": True},
    **fields,
  }


class TestCreate:
  @pytest.mark.asyncio
  async def test_creates_in_google_and_returns_the_synced_event(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(), PRIMARY)

    resp = await client.post(
      f"/v1/calendars/{calendar.id}/events",
      json=body(title=" Dentist ", timing=timed("2026-10-07T17:00", "2026-10-07T18:00"), location="Kungsgatan 1", notify_guests=False),
    )

    assert resp.status_code == 201, resp.text
    event = resp.json()["event"]
    assert (event["title"], event["location"], event["start_at"], event["editable"]) == ("Dentist", "Kungsgatan 1", "2026-10-07T15:00:00Z", True)
    created = next(r for r in google.writes() if r.method == "POST")
    assert created.body is not None
    assert created.body["start"] == {"dateTime": "2026-10-07T17:00:00", "timeZone": TZ}
    assert created.params["sendUpdates"] == "none"

  @pytest.mark.asyncio
  async def test_repeating_all_day_event(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(), PRIMARY)
    resp = await client.post(
      f"/v1/calendars/{calendar.id}/events",
      json=body(
        title="Bins",
        timing={"start": {"date": "2026-10-06"}, "end": {"date": "2026-10-07"}, "time_zone": TZ},
        recurrence={"frequency": "weekly", "by_weekday": ["TU"], "until": "2026-12-31"},
      ),
    )
    assert resp.status_code == 201, resp.text
    created = next(r for r in google.writes() if r.method == "POST").body
    assert created is not None
    assert created["recurrence"] == ["RRULE:FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231"]

  @pytest.mark.asyncio
  async def test_creates_in_icloud(self, client: AsyncClient, seed: Seed, caldav: FakeCalDAV, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(CalendarProvider.icloud), ICLOUD_HOME)

    resp = await client.post(f"/v1/calendars/{calendar.id}/events", json=body(title="Gym", timing=timed("2026-10-08T07:00", "2026-10-08T08:00")))

    assert resp.status_code == 201, resp.text
    assert resp.json()["event"]["title"] == "Gym"
    [href] = caldav.resources
    assert href.startswith(ICLOUD_HOME) and href.endswith(".ics")

  @pytest.mark.asyncio
  async def test_icloud_rejects_guests(self, client: AsyncClient, seed: Seed, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(CalendarProvider.icloud), ICLOUD_HOME)
    resp = await client.post(
      f"/v1/calendars/{calendar.id}/events",
      json=body(title="x", timing=timed("2026-10-08T07:00", "2026-10-08T08:00"), attendees=["a@b.com"]),
    )
    assert resp.status_code == 422
    assert "Guests" in resp.json()["detail"]


class TestPermissions:
  @pytest.mark.asyncio
  async def test_read_only_calendar(self, client: AsyncClient, seed: Seed, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(), "holidays", writable=False)
    resp = await client.post(f"/v1/calendars/{calendar.id}/events", json=body(title="x", timing=timed("2026-10-07T17:00", "2026-10-07T18:00")))
    assert resp.status_code == 403
    assert "read-only" in resp.json()["detail"]

  @pytest.mark.asyncio
  async def test_account_connected_read_only(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(can_write=False), PRIMARY)
    resp = await client.post(f"/v1/calendars/{calendar.id}/events", json=body(title="x", timing=timed("2026-10-07T17:00", "2026-10-07T18:00")))
    assert resp.status_code == 403
    assert "Reconnect" in resp.json()["detail"]
    assert google.requests == []

  @pytest.mark.asyncio
  async def test_write_scope_revoked_at_google(
    self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis, job_queue_manager: JobQueueManager
  ) -> None:
    account = await seed.account()
    calendar = await seed.calendar(account, PRIMARY)
    google.scope = "openid email https://www.googleapis.com/auth/calendar.readonly"

    resp = await client.post(f"/v1/calendars/{calendar.id}/events", json=body(title="x", timing=timed("2026-10-07T17:00", "2026-10-07T18:00")))

    assert resp.status_code == 403
    assert "Reconnect" in resp.json()["detail"]
    # A sync re-reads the scopes and marks the account read-only.
    assert [job[:2] for job in job_queue_manager._enqueued_jobs] == [("sync_calendar_account", (str(account.id),))]

  @pytest.mark.asyncio
  async def test_invitations_are_not_editable(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(), PRIMARY)
    google.add(PRIMARY, google_event("invite", organizer={"email": "boss@corp.com"}))
    [event] = await seed.sync_google(calendar)

    assert (await client.patch(f"/v1/calendars/events/{event.id}", json=body(title="x"))).status_code == 403
    assert (await client.delete(f"/v1/calendars/events/{event.id}", params={"time_zone": TZ})).status_code == 403

  @pytest.mark.asyncio
  async def test_other_users_events_are_not_found(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    other = User(auth0_sub="auth0|other", email="other@example.com")
    await seed.save_fixture(other)
    calendar = await seed.calendar(await seed.account(user_id=other.id), PRIMARY)
    google.add(PRIMARY, google_event("theirs"))
    [event] = await seed.sync_google(calendar)

    assert (
      await client.post(f"/v1/calendars/{calendar.id}/events", json=body(title="x", timing=timed("2026-10-07T17:00", "2026-10-07T18:00")))
    ).status_code == 404
    assert (await client.patch(f"/v1/calendars/events/{event.id}", json=body(title="x"))).status_code == 404
    assert (await client.delete(f"/v1/calendars/events/{event.id}", params={"time_zone": TZ})).status_code == 404


class TestValidation:
  @pytest.mark.asyncio
  @pytest.mark.parametrize(
    "payload",
    [
      body(title="x", timing=timed("2026-10-07T18:00", "2026-10-07T17:00")),
      body(title="x", timing=timed("2026-10-07T18:00", "2026-10-07T18:00")),
      body(title="x", timing={"start": {"date": "2026-10-07"}, "end": {"date_time": "2026-10-07T10:00"}, "time_zone": TZ}),
      body(title="x", timing={"start": {"date": "2026-10-07", "date_time": "2026-10-07T10:00"}, "end": {"date": "2026-10-08"}, "time_zone": TZ}),
      body(title="x", timing={**timed("2026-10-07T17:00+02:00", "2026-10-07T18:00")}),
      body(title="x", timing={"start": {"date": "2026-02-30"}, "end": {"date": "2026-03-01"}, "time_zone": TZ}),
      body(title="x", timing=timed("2026-10-07T25:00", "2026-10-07T26:00")),
      body(title="x", timing={**timed("2026-10-07T17:00", "2026-10-07T18:00"), "time_zone": "Mars/Olympus"}),
      body(title="x", timing=timed("2026-10-07T17:00", "2026-10-07T18:00"), recurrence={"frequency": "daily", "count": 3, "until": "2026-12-01"}),
      body(title="x", timing=timed("2026-10-07T17:00", "2026-10-07T18:00"), recurrence={"frequency": "daily", "by_weekday": ["MO"]}),
      body(title="x", timing=timed("2026-10-07T17:00", "2026-10-07T18:00"), recurrence={"frequency": "hourly"}),
      body(title="x", timing=timed("2026-10-07T17:00", "2026-10-07T18:00"), attendees=["not-an-email"]),
      {"title": "x", "timing": timed("2026-10-07T17:00", "2026-10-07T18:00")},
    ],
  )
  async def test_rejected(self, client: AsyncClient, seed: Seed, redis: Redis, payload: dict[str, Any]) -> None:
    calendar = await seed.calendar(await seed.account(), PRIMARY)
    assert (await client.post(f"/v1/calendars/{calendar.id}/events", json=payload)).status_code == 422

  @pytest.mark.asyncio
  async def test_timing_cannot_be_cleared(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(), PRIMARY)
    google.add(PRIMARY, google_event("e1"))
    [event] = await seed.sync_google(calendar)
    assert (await client.patch(f"/v1/calendars/events/{event.id}", json=body(timing=None))).status_code == 422


class TestUpdate:
  @pytest.mark.asyncio
  async def test_patch_keeps_the_row_and_refreshes_it(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(), PRIMARY)
    google.add(PRIMARY, google_event("e1", description="Agenda"))
    [event] = await seed.sync_google(calendar)

    resp = await client.patch(f"/v1/calendars/events/{event.id}", json=body(title="Planning v2", busy=False))

    assert resp.status_code == 200, resp.text
    updated = resp.json()["event"]
    assert (updated["id"], updated["title"], updated["busy"], updated["description"]) == (str(event.id), "Planning v2", False, "Agenda")
    patch = next(r for r in google.writes() if r.method == "PATCH")
    assert patch.body == {"summary": "Planning v2", "transparency": "transparent"}

  @pytest.mark.asyncio
  async def test_conflict_refreshes_in_the_background(
    self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis, job_queue_manager: JobQueueManager
  ) -> None:
    account = await seed.account()
    calendar = await seed.calendar(account, PRIMARY)
    google.add(PRIMARY, google_event("e1"))
    [event] = await seed.sync_google(calendar)
    google.get(PRIMARY, "e1")["etag"] = '"edited-on-phone"'

    resp = await client.patch(f"/v1/calendars/events/{event.id}", json=body(title="x"))

    assert resp.status_code == 409
    assert "changed in Google Calendar" in resp.json()["detail"]
    assert [job[:2] for job in job_queue_manager._enqueued_jobs] == [("sync_calendar_account", (str(account.id),))]

  @pytest.mark.asyncio
  async def test_deleted_at_provider(
    self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis, job_queue_manager: JobQueueManager
  ) -> None:
    calendar = await seed.calendar(await seed.account(), PRIMARY)
    google.add(PRIMARY, google_event("e1"))
    [event] = await seed.sync_google(calendar)
    del google.events[PRIMARY]["e1"]

    resp = await client.patch(f"/v1/calendars/events/{event.id}", json=body(title="x"))

    assert resp.status_code == 404
    assert len(job_queue_manager._enqueued_jobs) == 1

  @pytest.mark.asyncio
  async def test_move_within_account(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    account = await seed.account()
    calendar, work = await seed.calendar(account, PRIMARY), await seed.calendar(account, "work")
    google.add(PRIMARY, google_event("e1"))
    [event] = await seed.sync_google(calendar)

    resp = await client.patch(f"/v1/calendars/events/{event.id}", json=body(calendar_id=str(work.id)))

    assert resp.status_code == 200, resp.text
    assert resp.json()["event"]["calendar_id"] == str(work.id)
    assert "e1" in google.events["work"]

  @pytest.mark.asyncio
  async def test_move_across_accounts_is_rejected(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(), PRIMARY)
    elsewhere = await seed.calendar(await seed.account(CalendarProvider.icloud), ICLOUD_HOME)
    google.add(PRIMARY, google_event("e1"))
    [event] = await seed.sync_google(calendar)

    resp = await client.patch(f"/v1/calendars/events/{event.id}", json=body(calendar_id=str(elsewhere.id)))
    assert resp.status_code == 422
    assert "same account" in resp.json()["detail"]

  @pytest.mark.asyncio
  async def test_one_occurrence_cannot_change_the_rule(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(), PRIMARY)
    google.add(PRIMARY, google_event("series_1", recurringEventId="series", originalStartTime={"dateTime": "2026-10-07T09:00:00+02:00"}))
    [event] = await seed.sync_google(calendar)

    resp = await client.patch(f"/v1/calendars/events/{event.id}", json=body(recurrence={"frequency": "daily"}, scope="this"))
    assert resp.status_code == 422

  @pytest.mark.asyncio
  async def test_icloud_edit_round_trip(self, client: AsyncClient, seed: Seed, caldav: FakeCalDAV, redis: Redis) -> None:
    calendar = await seed.calendar(await seed.account(CalendarProvider.icloud), ICLOUD_HOME)
    created = await client.post(f"/v1/calendars/{calendar.id}/events", json=body(title="Gym", timing=timed("2026-10-08T07:00", "2026-10-08T08:00")))
    event_id = created.json()["event"]["id"]

    resp = await client.patch(f"/v1/calendars/events/{event_id}", json=body(timing=timed("2026-10-08T18:00", "2026-10-08T19:30")))

    assert resp.status_code == 200, resp.text
    assert resp.json()["event"]["id"] == event_id
    assert resp.json()["event"]["start_at"] == "2026-10-08T16:00:00Z"


class TestDelete:
  @pytest.mark.asyncio
  async def test_delete(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis, session: AsyncSession) -> None:
    calendar = await seed.calendar(await seed.account(), PRIMARY)
    google.add(PRIMARY, google_event("e1", attendees=[{"email": "a@b.com"}]))
    [event] = await seed.sync_google(calendar)

    resp = await client.delete(f"/v1/calendars/events/{event.id}", params={"time_zone": TZ, "notify_guests": "false"})

    assert resp.status_code == 204
    assert google.events[PRIMARY] == {}
    assert next(r for r in google.writes() if r.method == "DELETE").params["sendUpdates"] == "none"
    remaining = await session.execute(select(CalendarEvent).where(CalendarEvent.calendar_id == calendar.id))
    assert remaining.scalars().all() == []


class TestLocking:
  @pytest.mark.asyncio
  async def test_waits_for_a_running_sync_then_gives_up(
    self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    monkeypatch.setattr(editing, "LOCK_WAIT_SECONDS", 0.3)
    account = await seed.account()
    calendar = await seed.calendar(account, PRIMARY)

    async with account_lock(redis, account.id):
      resp = await client.post(f"/v1/calendars/{calendar.id}/events", json=body(title="x", timing=timed("2026-10-07T17:00", "2026-10-07T18:00")))

    assert resp.status_code == 503
    assert google.writes() == []

  @pytest.mark.asyncio
  async def test_lock_is_released_after_a_failed_write(self, client: AsyncClient, seed: Seed, google: FakeGoogleCalendar, redis: Redis) -> None:
    account = await seed.account()
    calendar = await seed.calendar(account, PRIMARY)
    google.failures[("POST", "")] = (500, {"error": {"code": 500}})

    resp = await client.post(f"/v1/calendars/{calendar.id}/events", json=body(title="x", timing=timed("2026-10-07T17:00", "2026-10-07T18:00")))

    assert resp.status_code == 503
    assert await redis.get(f"calendars:sync:{account.id}") is None
