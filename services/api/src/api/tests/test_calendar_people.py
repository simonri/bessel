from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx
import pytest
from api.calendars import http as provider_http
from api.calendars import people
from api.calendars.google import PEOPLE_SCOPES, GoogleCalendarClient
from api.calendars.providers import ProviderAuthError
from api.calendars.repository import CalendarEventRepository, CalendarPersonRepository
from api.common.encryption import encrypt
from api.common.utils import utc_now
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.calendar_person import CalendarPerson
from api.models.user import User
from api.postgres import AsyncSession
from api.settings import settings
from api.tests.fixtures.base import TEST_USER_INFO
from api.tests.fixtures.database import SaveFixture
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select

ALL_SCOPES = " ".join(["openid", "email", "https://www.googleapis.com/auth/calendar.readonly", *PEOPLE_SCOPES])
CONNECTIONS = "/v1/people/me/connections"
DIRECTORY = "/v1/people:listDirectoryPeople"
OTHER = "/v1/otherContacts"


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "id")
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "secret")


def person(email: str, name: str | None = None, photo: str | None = None, *, default_photo: bool = False) -> dict[str, Any]:
  body: dict[str, Any] = {"emailAddresses": [{"value": email}]}
  if name:
    body["names"] = [{"displayName": name, "metadata": {"primary": True}}]
  if photo:
    body["photos"] = [{"url": photo, **({"default": True} if default_photo else {})}]
  return body


class FakePeople:
  """Google's token endpoint and the three People API listings."""

  def __init__(self, scope: str = ALL_SCOPES) -> None:
    self.scope = scope
    # path -> list of pages (each a list of people), or an error status.
    self.sources: dict[str, list[list[dict[str, Any]]] | int] = {CONNECTIONS: [[]], DIRECTORY: [[]], OTHER: [[]]}
    self.requests: list[httpx.Request] = []

  def handler(self, request: httpx.Request) -> httpx.Response:
    self.requests.append(request)
    if request.url.host == "oauth2.googleapis.com":
      return httpx.Response(200, json={"access_token": "token", "scope": self.scope})
    source = self.sources[request.url.path]
    if isinstance(source, int):
      return httpx.Response(source, json={"error": {"code": source}})
    page = int(request.url.params.get("pageToken") or 0)
    key = {CONNECTIONS: "connections", DIRECTORY: "people", OTHER: "otherContacts"}[request.url.path]
    body: dict[str, Any] = {key: source[page]}
    if page + 1 < len(source):
      body["nextPageToken"] = str(page + 1)
    return httpx.Response(200, json=body)


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch) -> FakePeople:
  fake = FakePeople()
  monkeypatch.setattr(provider_http, "client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)))
  return fake


async def _list(fake: FakePeople) -> dict[str, tuple[str | None, str | None]]:
  async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)) as http:
    found = await GoogleCalendarClient(http).list_people("token")
  return {p.email: (p.name, p.photo_url) for p in found}


class TestListPeople:
  @pytest.mark.asyncio
  async def test_merges_sources_with_saved_contacts_first(self) -> None:
    fake = FakePeople()
    fake.sources[CONNECTIONS] = [[person("Andrey@oh.xyz", "Andrey G (saved)")]]
    fake.sources[DIRECTORY] = [[person("will@mistrezz.ai", "Will Owen", "https://lh3/will")]]
    fake.sources[OTHER] = [[person("andrey@oh.xyz", "Andrey Grushevskiy", "https://lh3/andrey"), person("dan@oh.xyz", "Dan Gordon")]]

    assert await _list(fake) == {
      # The saved name wins; the photo comes from wherever there is one.
      "andrey@oh.xyz": ("Andrey G (saved)", "https://lh3/andrey"),
      "will@mistrezz.ai": ("Will Owen", "https://lh3/will"),
      "dan@oh.xyz": ("Dan Gordon", None),
    }

  @pytest.mark.asyncio
  async def test_requests_names_emails_and_photos_with_the_directory_source(self) -> None:
    fake = FakePeople()
    await _list(fake)
    params = {r.url.path: dict(r.url.params) for r in fake.requests}
    assert params[CONNECTIONS]["personFields"] == "names,emailAddresses,photos"
    assert params[OTHER]["readMask"] == "names,emailAddresses,photos"
    assert params[DIRECTORY]["sources"] == "DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE"
    assert {p["pageSize"] for p in params.values()} == {"1000"}

  @pytest.mark.asyncio
  async def test_skips_generated_placeholder_photos(self) -> None:
    fake = FakePeople()
    fake.sources[OTHER] = [[person("dan@oh.xyz", "Dan", "https://lh3/letter-d", default_photo=True)]]
    assert await _list(fake) == {"dan@oh.xyz": ("Dan", None)}

  @pytest.mark.asyncio
  async def test_missing_sources_are_skipped(self) -> None:
    fake = FakePeople()
    fake.sources[DIRECTORY] = 400  # Gmail: no directory.
    fake.sources[CONNECTIONS] = 403  # Scope not granted.
    fake.sources[OTHER] = [[person("dan@oh.xyz", "Dan Gordon")]]
    assert await _list(fake) == {"dan@oh.xyz": ("Dan Gordon", None)}

  @pytest.mark.asyncio
  async def test_follows_pages_up_to_the_cap(self) -> None:
    fake = FakePeople()
    fake.sources[OTHER] = [[person(f"p{i}@x.com", f"P {i}")] for i in range(8)]
    assert len(await _list(fake)) == 5

  @pytest.mark.asyncio
  async def test_rejected_token_raises(self) -> None:
    fake = FakePeople()
    fake.sources[CONNECTIONS] = 401
    with pytest.raises(ProviderAuthError):
      await _list(fake)

  @pytest.mark.asyncio
  @pytest.mark.parametrize(("scope", "expected"), [(ALL_SCOPES, True), ("openid email", False), (PEOPLE_SCOPES[1], True)])
  async def test_grant_reports_people_access(self, scope: str, expected: bool) -> None:
    fake = FakePeople(scope)
    async with httpx.AsyncClient(transport=httpx.MockTransport(fake.handler)) as http:
      assert (await GoogleCalendarClient(http).refresh_access_token("r")).can_read_people is expected


def _session_maker(session: AsyncSession) -> Callable[[], Any]:
  @asynccontextmanager
  async def maker() -> AsyncIterator[AsyncSession]:
    yield session
    await session.flush()

  return maker


async def _account(save_fixture: SaveFixture, *, user: User | None = None, **fields: Any) -> tuple[CalendarAccount, Calendar]:
  if user is None:
    user = User(auth0_sub=f"auth0|{uuid4()}", email="me@example.com")
    await save_fixture(user)
  account = CalendarAccount(
    user_id=user.id,
    provider=fields.pop("provider", CalendarProvider.google),
    email=f"{uuid4().hex[:8]}@mistrezz.ai",
    encrypted_credentials=encrypt("refresh"),
    can_read_people=fields.pop("can_read_people", True),
    **fields,
  )
  await save_fixture(account)
  calendar = Calendar(account_id=account.id, external_id="primary", name="Primary", color="#4986e7")
  await save_fixture(calendar)
  return account, calendar


async def _event(save_fixture: SaveFixture, calendar: Calendar, *emails: str, creator: str | None = None) -> CalendarEvent:
  start = datetime(2026, 10, 6, 10, tzinfo=UTC)
  event = CalendarEvent(
    calendar_id=calendar.id,
    external_id=uuid4().hex,
    title="Meeting",
    all_day=False,
    start_at=start,
    end_at=start + timedelta(hours=1),
    creator_email=creator,
    attendees=[{"email": e, "name": None, "response": "accepted"} for e in emails],
  )
  await save_fixture(event)
  return event


class TestRefreshPeople:
  @pytest.mark.asyncio
  async def test_stores_only_people_on_the_accounts_events(self, session: AsyncSession, save_fixture: SaveFixture, google: FakePeople) -> None:
    account, calendar = await _account(save_fixture)
    await _event(save_fixture, calendar, "Andrey@oh.xyz", creator="boss@corp.com")
    google.sources[OTHER] = [
      [person("andrey@oh.xyz", "Andrey Grushevskiy"), person("boss@corp.com", "The Boss", "https://lh3/b"), person("stranger@x.com", "Not On Any Event")]
    ]

    assert await people.refresh_people(_session_maker(session), account.id)

    stored = (await session.execute(select(CalendarPerson.email, CalendarPerson.name).where(CalendarPerson.account_id == account.id))).all()
    assert sorted(stored) == [("andrey@oh.xyz", "Andrey Grushevskiy"), ("boss@corp.com", "The Boss")]
    assert account.people_synced_at is not None

  @pytest.mark.asyncio
  async def test_replaces_the_previous_list(self, session: AsyncSession, save_fixture: SaveFixture, google: FakePeople) -> None:
    account, calendar = await _account(save_fixture)
    await _event(save_fixture, calendar, "dan@oh.xyz")
    await save_fixture(CalendarPerson(account_id=account.id, email="gone@x.com", name="Gone"))
    google.sources[OTHER] = [[person("dan@oh.xyz", "Dan Gordon")]]

    await people.refresh_people(_session_maker(session), account.id)

    assert (await session.execute(select(CalendarPerson.email).where(CalendarPerson.account_id == account.id))).scalars().all() == ["dan@oh.xyz"]

  @pytest.mark.asyncio
  @pytest.mark.parametrize(
    "fields",
    [
      {"can_read_people": False},
      {"provider": CalendarProvider.icloud},
      {"people_synced_at": utc_now() - timedelta(hours=1)},
    ],
    ids=["not-granted", "icloud", "fresh"],
  )
  async def test_skips_when_not_needed(self, session: AsyncSession, save_fixture: SaveFixture, google: FakePeople, fields: dict[str, Any]) -> None:
    account, _ = await _account(save_fixture, **fields)
    assert not await people.refresh_people(_session_maker(session), account.id)
    assert google.requests == []

  @pytest.mark.asyncio
  async def test_revoked_scope_leaves_the_timestamp_unset(self, session: AsyncSession, save_fixture: SaveFixture, google: FakePeople) -> None:
    account, _ = await _account(save_fixture)
    google.scope = "openid email"
    assert not await people.refresh_people(_session_maker(session), account.id)
    assert account.people_synced_at is None

  @pytest.mark.asyncio
  async def test_stale_list_is_refetched(self, session: AsyncSession, save_fixture: SaveFixture, google: FakePeople) -> None:
    account, _ = await _account(save_fixture, people_synced_at=utc_now() - people.REFRESH_EVERY - timedelta(minutes=1))
    assert await people.refresh_people(_session_maker(session), account.id)


class TestEmailsOnEvents:
  @pytest.mark.asyncio
  async def test_guests_and_organizers_lowercased_for_this_account_only(self, session: AsyncSession, save_fixture: SaveFixture) -> None:
    account, calendar = await _account(save_fixture)
    _, other_calendar = await _account(save_fixture)
    await _event(save_fixture, calendar, "A@x.com", "b@x.com", creator="Boss@x.com")
    await _event(save_fixture, other_calendar, "elsewhere@x.com")

    assert await CalendarEventRepository.from_session(session).emails_for_account(account) == {"a@x.com", "b@x.com", "boss@x.com"}


class TestEventsShowPeople:
  async def _me(self, client: AsyncClient, session: AsyncSession) -> User:
    assert (await client.get("/v1/calendars/accounts")).status_code == 200
    return (await session.execute(select(User).where(User.auth0_sub == TEST_USER_INFO.sub))).scalar_one()

  @pytest.mark.asyncio
  async def test_names_and_photos_from_contacts_fill_in_missing_names(self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture) -> None:
    me = await self._me(client, session)
    account, calendar = await _account(save_fixture, user=me)
    event = await _event(save_fixture, calendar, "Andrey@oh.xyz", "dan@oh.xyz", "nobody@x.com")
    event.attendees = [*event.attendees[:1], {"email": "dan@oh.xyz", "name": "Dan (from invite)", "response": "accepted"}, event.attendees[2]]
    await save_fixture(event)
    await save_fixture(CalendarPerson(account_id=account.id, email="andrey@oh.xyz", name="Andrey Grushevskiy", photo_url="https://lh3/a"))
    await save_fixture(CalendarPerson(account_id=account.id, email="dan@oh.xyz", name="Dan Gordon", photo_url="https://lh3/d"))

    window = {"start_ts": int(datetime(2026, 10, 5, tzinfo=UTC).timestamp()), "end_ts": int(datetime(2026, 10, 8, tzinfo=UTC).timestamp())}
    [shown] = (await client.get("/v1/calendars/events", params=window)).json()["events"]

    assert [(a["name"], a["photo_url"]) for a in shown["attendees"]] == [
      ("Andrey Grushevskiy", "https://lh3/a"),
      # The invite's own name wins; the photo still helps.
      ("Dan (from invite)", "https://lh3/d"),
      (None, None),
    ]

  @pytest.mark.asyncio
  async def test_other_users_contacts_never_name_my_guests(self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture) -> None:
    me = await self._me(client, session)
    _, calendar = await _account(save_fixture, user=me)
    await _event(save_fixture, calendar, "andrey@oh.xyz")
    their_account, _ = await _account(save_fixture)
    await save_fixture(CalendarPerson(account_id=their_account.id, email="andrey@oh.xyz", name="Their Name", photo_url="https://lh3/x"))

    window = {"start_ts": int(datetime(2026, 10, 5, tzinfo=UTC).timestamp()), "end_ts": int(datetime(2026, 10, 8, tzinfo=UTC).timestamp())}
    [shown] = (await client.get("/v1/calendars/events", params=window)).json()["events"]
    assert shown["attendees"][0]["name"] is None and shown["attendees"][0]["photo_url"] is None

  @pytest.mark.asyncio
  async def test_lookup_spans_all_my_accounts(self, session: AsyncSession, save_fixture: SaveFixture) -> None:
    user = User(auth0_sub=f"auth0|{uuid4()}", email="me@example.com")
    await save_fixture(user)
    google_account, _ = await _account(save_fixture, user=user)
    await save_fixture(CalendarPerson(account_id=google_account.id, email="dan@oh.xyz", name="Dan Gordon"))
    found = await CalendarPersonRepository.from_session(session).lookup_for_user(user.id, {"dan@oh.xyz", "x@y.com"})
    assert {e: p.name for e, p in found.items()} == {"dan@oh.xyz": "Dan Gordon"}
