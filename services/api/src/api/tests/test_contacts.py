from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Any

import httpx
import pytest
from api.calendars import http as provider_http
from api.common.encryption import encrypt
from api.contacts import endpoints as contact_endpoints
from api.contacts.person import parse_person
from api.contacts.repository import ContactSourceRepository
from api.contacts.service import sync_source
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.contact import Contact, ContactMethodKind, ContactSource
from api.models.user import User
from api.settings import settings
from api.tests.people_fake import FakePeople
from cryptography.fernet import Fernet
from httpx import AsyncClient
from pytest_mock import MockerFixture
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

type SessionMaker = Callable[[], AbstractAsyncContextManager[AsyncSession]]

PHONE = {"value": "+46 70 123 45 67", "type": "mobile", "formattedType": "Mobile"}


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "id")
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "secret")


@pytest.fixture
def people(monkeypatch: pytest.MonkeyPatch) -> FakePeople:
  fake = FakePeople()
  monkeypatch.setattr(provider_http, "client", lambda: httpx.AsyncClient(transport=fake.transport()))
  return fake


@pytest.fixture
def session_maker(session: AsyncSession) -> SessionMaker:
  @asynccontextmanager
  async def make() -> AsyncIterator[AsyncSession]:
    yield session
    await session.flush()

  return make


async def _source(session: AsyncSession, user: User, *, can_read_people: bool = True) -> ContactSource:
  account = CalendarAccount(
    user_id=user.id, provider=CalendarProvider.google, email="me@gmail.com", encrypted_credentials=encrypt("refresh"), can_read_people=can_read_people
  )
  session.add(account)
  await session.flush()
  sources = await ContactSourceRepository.from_session(session).ensure_for_user(user.id)
  return sources[0]


async def _contacts(session: AsyncSession, source: ContactSource, *, include_deleted: bool = False) -> dict[str, Contact]:
  statement = select(Contact).where(Contact.source_id == source.id).execution_options(populate_existing=True)
  rows = (await session.execute(statement)).scalars().all()
  return {c.resource_name: c for c in rows if include_deleted or c.deleted_at is None}


class TestParsePerson:
  def test_reads_names_ways_to_reach_and_a_birthday_without_a_year(self) -> None:
    parsed = parse_person(
      {
        "resourceName": "people/c1",
        "etag": "%E1",
        "names": [{"displayName": "Anna Berg", "givenName": "Anna", "familyName": "Berg", "metadata": {"primary": True}}],
        "phoneNumbers": [PHONE, {"value": "08-123 456", "formattedType": "Work"}],
        "emailAddresses": [{"value": "anna@example.com", "type": "home"}],
        "addresses": [{"streetAddress": "Storgatan 1", "city": "Lund", "type": "home"}],
        "birthdays": [{"date": {"year": 0, "month": 3, "day": 14}}],
        "organizations": [{"name": "Acme", "title": "CTO"}],
        "photos": [{"url": "https://example.com/default.png", "default": True}],
      }
    )

    assert (parsed.display_name, parsed.given_name, parsed.family_name) == ("Anna Berg", "Anna", "Berg")
    assert (parsed.birthday_month, parsed.birthday_day, parsed.birthday_year) == (3, 14, None)
    assert (parsed.organization, parsed.job_title, parsed.photo_url) == ("Acme", "CTO", None)
    assert [(m.kind, m.label, m.value) for m in parsed.methods] == [
      (ContactMethodKind.phone, "Mobile", "+46 70 123 45 67"),
      (ContactMethodKind.phone, "Work", "08-123 456"),
      (ContactMethodKind.email, "home", "anna@example.com"),
      (ContactMethodKind.address, "home", "Storgatan 1, Lund"),
    ]

  def test_someone_without_a_name_is_shown_by_company_then_email(self) -> None:
    company = parse_person({"resourceName": "people/c1", "organizations": [{"name": "Vattenfall"}], "emailAddresses": [{"value": "x@v.se"}]})
    email_only = parse_person({"resourceName": "people/c2", "emailAddresses": [{"value": "x@v.se"}]})

    assert (company.display_name, email_only.display_name) == ("Vattenfall", "x@v.se")

  def test_a_deleted_person_is_read_as_deleted(self) -> None:
    assert parse_person({"resourceName": "people/c1", "metadata": {"deleted": True}}).deleted is True


class TestSync:
  @pytest.mark.asyncio
  async def test_a_first_sync_mirrors_everyone_and_keeps_the_token(
    self, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker
  ) -> None:
    people.put("people/c1", names=[{"displayName": "Anna Berg"}], phoneNumbers=[PHONE])
    people.put("people/c2", names=[{"displayName": "Bo Ek"}])
    people.page_size = 1
    source = await _source(session, user)

    assert await sync_source(session_maker, source.id) is True

    contacts = await _contacts(session, source)
    assert {c.display_name for c in contacts.values()} == {"Anna Berg", "Bo Ek"}
    assert [m.value for m in contacts["people/c1"].methods] == ["+46 70 123 45 67"]
    assert contacts["people/c1"].person["names"] == [{"displayName": "Anna Berg"}]
    assert source.sync_token == "t2"
    assert source.synced_at is not None
    assert len(people.requests) == 2, "two pages"
    first, second = people.requests
    assert {k: v for k, v in second.items() if k != "pageToken"} == first, "every page repeats the first request's parameters"

  @pytest.mark.asyncio
  async def test_the_next_sync_asks_only_for_changes_and_applies_edits_and_deletions(
    self, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker
  ) -> None:
    people.put("people/c1", names=[{"displayName": "Anna Berg"}])
    people.put("people/c2", names=[{"displayName": "Bo Ek"}])
    source = await _source(session, user)
    await sync_source(session_maker, source.id)
    anna_id = (await _contacts(session, source))["people/c1"].id

    people.put("people/c1", names=[{"displayName": "Anna Lind"}], phoneNumbers=[PHONE])
    people.delete("people/c2")
    people.put("people/c3", names=[{"displayName": "Cia Ny"}])
    await sync_source(session_maker, source.id)

    assert people.requests[-1]["syncToken"] == "t2"
    contacts = await _contacts(session, source)
    assert sorted(c.display_name for c in contacts.values()) == ["Anna Lind", "Cia Ny"]
    assert contacts["people/c1"].id == anna_id
    assert [m.value for m in contacts["people/c1"].methods] == ["+46 70 123 45 67"]
    assert (await _contacts(session, source, include_deleted=True))["people/c2"].deleted_at is not None

  @pytest.mark.asyncio
  @pytest.mark.parametrize("expire_with", [410, 400])
  async def test_an_expired_token_falls_back_to_a_full_sync_that_keeps_everyone_known(
    self, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, expire_with: int
  ) -> None:
    people.put("people/c1", names=[{"displayName": "Anna Berg"}])
    people.put("people/c2", names=[{"displayName": "Bo Ek"}])
    source = await _source(session, user)
    await sync_source(session_maker, source.id)
    anna_id = (await _contacts(session, source))["people/c1"].id

    # Bo goes while the token is expired; the full sync just doesn't list him.
    people.people.pop("people/c2")
    people.expired.add("t2")
    people.expire_with = expire_with
    assert await sync_source(session_maker, source.id) is True

    assert "syncToken" not in people.requests[-1]
    contacts = await _contacts(session, source, include_deleted=True)
    assert contacts["people/c1"].id == anna_id and contacts["people/c1"].deleted_at is None
    assert contacts["people/c2"].deleted_at is not None
    assert source.sync_token == f"t{people.version}"

  @pytest.mark.asyncio
  async def test_someone_deleted_and_added_back_returns_as_the_same_contact(
    self, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker
  ) -> None:
    people.put("people/c1", names=[{"displayName": "Anna Berg"}])
    source = await _source(session, user)
    await sync_source(session_maker, source.id)
    anna_id = (await _contacts(session, source))["people/c1"].id
    people.delete("people/c1")
    await sync_source(session_maker, source.id)

    people.put("people/c1", names=[{"displayName": "Anna Berg"}])
    await sync_source(session_maker, source.id)

    assert (await _contacts(session, source))["people/c1"].id == anna_id

  @pytest.mark.asyncio
  async def test_a_refused_grant_is_recorded_on_the_source(self, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker) -> None:
    people.token_status = 400
    source = await _source(session, user)

    assert await sync_source(session_maker, source.id) is False

    assert source.sync_error is not None and "Reconnect" in source.sync_error
    assert source.sync_token is None

  @pytest.mark.asyncio
  async def test_only_google_accounts_that_may_read_contacts_get_a_source(self, session: AsyncSession, user: User) -> None:
    session.add(
      CalendarAccount(user_id=user.id, provider=CalendarProvider.google, email="a@gmail.com", encrypted_credentials=encrypt("r"), can_read_people=True)
    )
    session.add(
      CalendarAccount(user_id=user.id, provider=CalendarProvider.google, email="b@gmail.com", encrypted_credentials=encrypt("r"), can_read_people=False)
    )
    session.add(
      CalendarAccount(user_id=user.id, provider=CalendarProvider.icloud, email="c@icloud.com", encrypted_credentials=encrypt("r"), can_read_people=True)
    )
    await session.flush()
    repo = ContactSourceRepository.from_session(session)

    first = await repo.ensure_for_user(user.id)
    again = await repo.ensure_for_user(user.id)

    assert [(await repo.account_for(s)).email for s in first] == ["a@gmail.com"]
    assert [s.id for s in again] == [s.id for s in first]


@pytest.mark.keep_session_state
class TestEndpoints:
  async def _synced(self, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker) -> None:
    people.put(
      "people/c1",
      names=[{"displayName": "Anna Berg"}],
      phoneNumbers=[PHONE],
      emailAddresses=[{"value": "anna@example.com"}],
      birthdays=[{"date": {"month": 3, "day": 14}}],
    )
    people.put("people/c2", names=[{"displayName": "Bo Ek"}], organizations=[{"name": "Acme"}])
    source = await _source(session, user)
    await sync_source(session_maker, source.id)

  @pytest.mark.asyncio
  async def test_lists_and_searches_by_name_company_number_and_email(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker
  ) -> None:
    await self._synced(session, user, people, session_maker)

    async def names(**params: Any) -> list[str]:
      return [c["display_name"] for c in (await client.get("/v1/contacts", params=params)).json()["items"]]

    assert await names() == ["Anna Berg", "Bo Ek"]
    assert await names(search="acme") == ["Bo Ek"]
    assert await names(search="123 45") == ["Anna Berg"]
    assert await names(search="ANNA@") == ["Anna Berg"]

  @pytest.mark.asyncio
  async def test_a_contact_reads_with_its_ways_to_reach_and_birthday(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker
  ) -> None:
    await self._synced(session, user, people, session_maker)
    anna = next(c for c in (await client.get("/v1/contacts")).json()["items"] if c["display_name"] == "Anna Berg")

    detail = (await client.get(f"/v1/contacts/{anna['id']}")).json()

    assert detail["phones"] == [{"label": "Mobile", "value": "+46 70 123 45 67"}]
    assert detail["emails"] == [{"label": None, "value": "anna@example.com"}]
    assert detail["birthday"] == {"month": 3, "day": 14, "year": None}
    assert detail["external_url"] == "https://contacts.google.com/person/c1"

  @pytest.mark.asyncio
  async def test_someone_deleted_from_the_address_book_is_gone_from_the_list(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker
  ) -> None:
    await self._synced(session, user, people, session_maker)
    bo = next(c for c in (await client.get("/v1/contacts")).json()["items"] if c["display_name"] == "Bo Ek")
    people.delete("people/c2")
    source = (await ContactSourceRepository.from_session(session).list_for_user(user.id))[0]
    await sync_source(session_maker, source.id)

    assert [c["display_name"] for c in (await client.get("/v1/contacts")).json()["items"]] == ["Anna Berg"]
    assert (await client.get(f"/v1/contacts/{bo['id']}")).status_code == 404

  @pytest.mark.asyncio
  async def test_sources_say_where_contacts_come_from_and_sync_now_queues_each(
    self, client: AsyncClient, session: AsyncSession, user: User, mocker: MockerFixture
  ) -> None:
    session.add(
      CalendarAccount(user_id=user.id, provider=CalendarProvider.google, email="me@gmail.com", encrypted_credentials=encrypt("r"), can_read_people=True)
    )
    await session.flush()
    queued = mocker.patch.object(contact_endpoints, "request_sync")

    sources = (await client.get("/v1/contacts/sources")).json()
    synced = await client.post("/v1/contacts/sync")

    assert [(s["email"], s["synced_at"]) for s in sources] == [("me@gmail.com", None)]
    assert synced.status_code == 202
    assert [str(call.args[0]) for call in queued.call_args_list] == [sources[0]["id"]]
