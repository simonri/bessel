import base64
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
import pytest_asyncio
from api.app import app as api_app
from api.calendars import http as provider_http
from api.calendars.google import CONTACTS_WRITE_SCOPE, _grant
from api.common.encryption import decrypt, encrypt
from api.contacts.edit import build_update
from api.contacts.phones import compact_phone, display_phone
from api.contacts.repository import ContactSourceRepository
from api.contacts.service import sync_source
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.contact import Contact, ContactSource
from api.models.user import User
from api.redis import Redis, create_redis, get_redis
from api.settings import settings
from api.tests.people_fake import FakePeople
from cryptography.fernet import Fernet
from httpx import AsyncClient
from pytest_mock import MockerFixture
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

type SessionMaker = Callable[[], AbstractAsyncContextManager[AsyncSession]]

MOBILE = {"value": "+46 70 123 45 67", "type": "mobile", "formattedType": "Mobile", "metadata": {"primary": True}}
WORK = {"value": "08123456", "canonicalForm": "+468123456", "type": "work", "formattedType": "Work"}


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
def people(monkeypatch: pytest.MonkeyPatch) -> FakePeople:
  fake = FakePeople(scope=f"https://www.googleapis.com/auth/contacts.readonly {CONTACTS_WRITE_SCOPE}")
  monkeypatch.setattr(provider_http, "client", lambda: httpx.AsyncClient(transport=fake.transport()))
  return fake


@pytest.fixture
def session_maker(session: AsyncSession) -> SessionMaker:
  @asynccontextmanager
  async def make() -> AsyncIterator[AsyncSession]:
    yield session
    await session.flush()

  return make


async def _synced(session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, *, can_edit: bool = True) -> ContactSource:
  account = CalendarAccount(
    user_id=user.id,
    provider=CalendarProvider.google,
    email="me@gmail.com",
    encrypted_credentials=encrypt("refresh"),
    can_read_people=True,
    can_write_contacts=can_edit,
  )
  session.add(account)
  await session.flush()
  source = (await ContactSourceRepository.from_session(session).ensure_for_user(user.id))[0]
  await sync_source(session_maker, source.id)
  return source


async def _contact(session: AsyncSession, resource_name: str) -> Contact:
  statement = select(Contact).where(Contact.resource_name == resource_name).execution_options(populate_existing=True)
  return (await session.execute(statement)).scalar_one()


class TestBuildUpdate:
  def test_changing_one_number_keeps_the_other_and_its_label(self) -> None:
    person = {"resourceName": "people/c1", "etag": "%E1", "phoneNumbers": [MOBILE, WORK], "names": [{"givenName": "Anna"}]}

    body, fields = build_update(person, {"phones": [{"label": "Mobile", "value": "+46 70 999 99 99"}, {"label": "Work", "value": "08-123 456"}]})

    assert fields == ["phoneNumbers"]
    assert body["etag"] == "%E1" and "names" not in body
    new, work = body["phoneNumbers"]
    assert new == {"value": "+46709999999", "type": "mobile"}
    assert work == WORK, "an untouched entry goes back exactly as Google sent it"

  def test_numbers_are_saved_without_spacing_keeping_their_labels(self) -> None:
    person = {"resourceName": "people/c1", "etag": "%E1", "phoneNumbers": [MOBILE, WORK]}

    body, _ = build_update(person, {"phones": [{"label": "Mobile", "value": "+46 70 123 45 67"}, {"label": "Work", "value": "08-12 34 56"}]})

    mobile, work = body["phoneNumbers"]
    assert mobile == {"value": "+46701234567", "type": "mobile", "formattedType": "Mobile", "metadata": {"primary": True}}
    assert work == WORK

  def test_relabelling_keeps_the_entry_and_clearing_empties_the_field(self) -> None:
    person = {"resourceName": "people/c1", "etag": "%E1", "emailAddresses": [{"value": "a@x.se", "type": "home", "metadata": {"primary": True}}]}

    body, fields = build_update(person, {"emails": [{"label": "Work", "value": "a@x.se"}], "nickname": None, "birthday": None})

    assert fields == ["birthdays", "emailAddresses", "nicknames"]
    assert body["emailAddresses"] == [{"value": "a@x.se", "type": "work", "metadata": {"primary": True}}]
    assert (body["nicknames"], body["birthdays"]) == ([], [])

  def test_labels_google_knows_are_sent_as_its_own_and_others_as_typed(self) -> None:
    body, _ = build_update(
      {},
      {
        "phones": [
          {"label": "Work mobile", "value": "070-111 11 11"},
          {"label": "MAIN", "value": "08-22 22 22"},
          {"label": "Gym", "value": "070-333 33 33"},
        ],
        "emails": [{"label": "Home", "value": "a@x.se"}, {"label": "Work mobile", "value": "b@x.se"}],
        "addresses": [{"label": "other", "value": "Storgatan 1"}],
      },
    )

    assert [p["type"] for p in body["phoneNumbers"]] == ["workMobile", "main", "Gym"]
    assert [e["type"] for e in body["emailAddresses"]] == ["home", "Work mobile"], "only phones have a work mobile"
    assert body["addresses"] == [{"formattedValue": "Storgatan 1", "type": "other"}]

  def test_names_and_companies_change_part_by_part(self) -> None:
    person = {
      "resourceName": "people/c1",
      "etag": "%E1",
      "names": [{"givenName": "Anna", "familyName": "Berg", "displayName": "Anna Berg", "unstructuredName": "Anna Berg"}],
      "organizations": [{"name": "Acme", "title": "CTO", "department": "R&D"}],
    }

    body, fields = build_update(person, {"family_name": "Lind", "job_title": "CEO"})

    assert fields == ["names", "organizations"]
    assert body["names"] == [{"givenName": "Anna", "familyName": "Lind"}]
    assert body["organizations"] == [{"name": "Acme", "title": "CEO", "department": "R&D"}]

  def test_prefix_middle_name_and_suffix_change_on_their_own(self) -> None:
    person = {"resourceName": "people/c1", "etag": "%E1", "names": [{"honorificPrefix": "Frösåker", "givenName": "Johan", "familyName": "Fryckne"}]}

    kept, _ = build_update(person, {"given_name": "Jon"})
    changed, _ = build_update(person, {"name_prefix": None, "middle_name": "Erik", "name_suffix": "Jr."})

    assert kept["names"] == [{"honorificPrefix": "Frösåker", "givenName": "Jon", "familyName": "Fryckne"}]
    assert changed["names"] == [{"givenName": "Johan", "middleName": "Erik", "familyName": "Fryckne", "honorificSuffix": "Jr."}]

  def test_a_middle_name_alone_is_still_a_name(self) -> None:
    body, _ = build_update({}, {"middle_name": "Erik"})

    assert body == {"names": [{"middleName": "Erik"}]}

  def test_a_birthday_without_a_year_leaves_the_year_out(self) -> None:
    body, _ = build_update({}, {"birthday": {"month": 3, "day": 14, "year": None}})

    assert body == {"birthdays": [{"date": {"month": 3, "day": 14}}]}


class TestGrant:
  def test_the_contacts_scope_allows_editing_and_reading_people(self) -> None:
    write = _grant({"access_token": "t", "scope": f"openid {CONTACTS_WRITE_SCOPE}"}, None)
    read = _grant({"access_token": "t", "scope": "https://www.googleapis.com/auth/contacts.readonly"}, None)

    assert (write.can_write_contacts, write.can_read_people) == (True, True)
    assert (read.can_write_contacts, read.can_read_people) == (False, True)


@pytest.mark.keep_session_state
class TestEditing:
  @pytest.mark.asyncio
  async def test_an_edit_goes_to_google_and_shows_what_google_stored(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna", "displayName": "Anna"}], phoneNumbers=[MOBILE, WORK])
    await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")

    response = await client.patch(
      f"/v1/contacts/{anna.id}",
      json={"family_name": "Berg", "phones": [{"label": "Mobile", "value": "+46 70 999 99 99"}, {"label": "Work", "value": "08-123 456"}]},
    )

    assert response.status_code == 200, response.text
    method, path, mask, body = people.writes[-1]
    assert (method, path, mask) == ("PATCH", "people/c1:updateContact", "names,phoneNumbers")
    assert body is not None and body["phoneNumbers"][1] == WORK
    stored = people.people["people/c1"][0]
    assert stored["names"] == [{"givenName": "Anna", "familyName": "Berg"}]
    assert [(p["value"], p["display"]) for p in response.json()["phones"]] == [("+46709999999", "070-999 99 99"), ("08123456", "08-12 34 56")]

  @pytest.mark.asyncio
  async def test_an_edit_to_someone_changed_in_google_meanwhile_lands_on_the_latest_version(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}], phoneNumbers=[MOBILE])
    await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")
    # Edited on the phone after Bessel's last sync.
    people.put("people/c1", names=[{"givenName": "Anna"}], phoneNumbers=[MOBILE], emailAddresses=[{"value": "anna@phone.se"}])

    response = await client.patch(f"/v1/contacts/{anna.id}", json={"nickname": "Nana"})

    assert response.status_code == 200, response.text
    assert [w[0] for w in people.writes] == ["PATCH", "PATCH"], "the first try is refused, the retry lands"
    stored = people.people["people/c1"][0]
    assert stored["nicknames"] == [{"value": "Nana"}]
    assert stored["emailAddresses"] == [{"value": "anna@phone.se"}], "the phone's change survives"

  @pytest.mark.asyncio
  async def test_a_sync_lagging_behind_an_edit_does_not_undo_it(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}])
    source = await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")
    before = people.people["people/c1"]
    await client.patch(f"/v1/contacts/{anna.id}", json={"nickname": "Nana"})

    # Google's sync hasn't caught up: it still sends the person as they were.
    people.people["people/c1"] = (before[0], people.version + 1)
    people.version += 1
    await sync_source(session_maker, source.id)

    assert (await _contact(session, "people/c1")).nickname == "Nana"

  @pytest.mark.asyncio
  async def test_add_and_delete_go_through_to_google(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    source = await _synced(session, user, people, session_maker)

    created = await client.post(
      "/v1/contacts", json={"source_id": str(source.id), "given_name": "Cia", "phones": [{"label": "Mobile", "value": "070-987 65 43"}]}
    )
    assert created.status_code == 201, created.text
    resource_name = next(name for name in people.people if not people.people[name][0]["metadata"].get("deleted"))
    assert people.people[resource_name][0]["phoneNumbers"] == [{"value": "0709876543", "type": "mobile"}]

    deleted = await client.delete(f"/v1/contacts/{created.json()['id']}")

    assert deleted.status_code == 204
    assert people.people[resource_name][0]["metadata"].get("deleted") is True
    assert (await client.get("/v1/contacts")).json()["items"] == []

  @pytest.mark.asyncio
  async def test_a_contact_needs_something_to_know_them_by(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    source = await _synced(session, user, people, session_maker)

    response = await client.post("/v1/contacts", json={"source_id": str(source.id), "notes": "Who?"})

    assert response.status_code == 422
    assert people.writes == []

  @pytest.mark.asyncio
  async def test_without_permission_nothing_is_sent_and_the_page_is_told_to_ask_for_it(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}])
    await _synced(session, user, people, session_maker, can_edit=False)
    anna = await _contact(session, "people/c1")

    response = await client.patch(f"/v1/contacts/{anna.id}", json={"nickname": "Nana"})
    sources = (await client.get("/v1/contacts/sources")).json()

    assert response.status_code == 403
    assert people.writes == []
    assert [s["can_edit"] for s in sources] == [False]

  @pytest.mark.asyncio
  async def test_google_withdrawing_permission_marks_the_source_read_only(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}])
    await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")
    people.write_status = 403

    response = await client.patch(f"/v1/contacts/{anna.id}", json={"nickname": "Nana"})

    assert response.status_code == 403
    assert [s["can_edit"] for s in (await client.get("/v1/contacts/sources")).json()] == [False]

  @pytest.mark.asyncio
  async def test_allowing_editing_asks_google_for_just_the_contacts_scope_for_that_account(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker
  ) -> None:
    source = await _synced(session, user, people, session_maker, can_edit=False)

    url = (await client.post(f"/v1/contacts/sources/{source.id}/authorize")).json()["url"]

    query = parse_qs(urlparse(url).query)
    assert query["scope"] == [CONTACTS_WRITE_SCOPE]
    assert query["include_granted_scopes"] == ["true"]
    assert query["login_hint"] == ["me@gmail.com"]

  @pytest.mark.asyncio
  async def test_coming_back_from_google_with_the_scope_makes_the_contacts_editable_and_keeps_the_refresh_token(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis, mocker: MockerFixture
  ) -> None:
    source = await _synced(session, user, people, session_maker, can_edit=False)
    mocker.patch("api.calendars.service.enqueue_job")
    url = (await client.post(f"/v1/contacts/sources/{source.id}/authorize")).json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]

    response = await client.post("/v1/calendars/google/callback", json={"code": "code", "state": state})

    assert response.status_code == 201, response.text
    assert [s["can_edit"] for s in (await client.get("/v1/contacts/sources")).json()] == [True]
    account = await session.scalar(select(CalendarAccount).where(CalendarAccount.user_id == user.id))
    assert account is not None
    await session.refresh(account)
    assert decrypt(account.encrypted_credentials) == "refresh", "a grant without a refresh token must keep the stored one"


PICKED = {
  "formatted": "Drottninggatan 5, 111 51 Stockholm",
  "street_address": "Drottninggatan 5",
  "postal_code": "111 51",
  "city": "Stockholm",
  "region": "Stockholms län",
  "country": "Sverige",
  "country_code": "SE",
  "latitude": 59.3307,
  "longitude": 18.0631,
}


@pytest.mark.keep_session_state
class TestPickedAddresses:
  @pytest.mark.asyncio
  async def test_a_picked_address_goes_to_google_in_parts_and_keeps_where_it_is(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}])
    await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")
    people.address_suffix = ", Sverige"

    response = await client.patch(
      f"/v1/contacts/{anna.id}",
      json={"addresses": [{"label": "Home", "value": PICKED["formatted"], "address": PICKED}]},
    )

    assert response.status_code == 200, response.text
    sent = people.writes[-1][3]
    assert sent is not None and sent["addresses"] == [
      {
        "formattedValue": "Drottninggatan 5, 111 51 Stockholm",
        "type": "home",
        "streetAddress": "Drottninggatan 5",
        "postalCode": "111 51",
        "city": "Stockholm",
        "region": "Stockholms län",
        "country": "Sverige",
        "countryCode": "SE",
      }
    ]
    [address] = response.json()["addresses"]
    assert address["value"] == "Drottninggatan 5, 111 51 Stockholm, Sverige", "as Google stored it"
    assert (address["latitude"], address["longitude"]) == (59.3307, 18.0631)
    listed = (await client.get("/v1/contacts")).json()["items"][0]["addresses"][0]
    assert (listed["latitude"], listed["longitude"]) == (59.3307, 18.0631)

  @pytest.mark.asyncio
  async def test_picking_the_same_text_still_replaces_the_old_parts(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    old = {
      "formattedValue": PICKED["formatted"],
      "streetAddress": "Drottninggatan 5",
      "city": "Solna",
      "region": "Uppland",
      "extendedAddress": "c/o Berg",
      "type": "home",
    }
    people.put("people/c1", names=[{"givenName": "Anna"}], addresses=[old])
    await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")

    picked = {**PICKED, "region": None}
    await client.patch(f"/v1/contacts/{anna.id}", json={"addresses": [{"label": "Home", "value": PICKED["formatted"], "address": picked}]})

    [sent] = (people.writes[-1][3] or {})["addresses"]
    assert sent["city"] == "Stockholm"
    assert "region" not in sent, "a part the new address doesn't have is dropped, not kept from the old one"
    assert "extendedAddress" not in sent
    assert sent["type"] == "home"

  @pytest.mark.asyncio
  async def test_a_typed_address_goes_as_typed_with_no_location(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}])
    await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")

    response = await client.patch(f"/v1/contacts/{anna.id}", json={"addresses": [{"label": "Summer house", "value": "Ön, Gotland"}]})

    [sent] = (people.writes[-1][3] or {})["addresses"]
    assert sent == {"formattedValue": "Ön, Gotland", "type": "Summer house"}
    [address] = response.json()["addresses"]
    assert (address["latitude"], address["longitude"]) == (None, None)

  @pytest.mark.asyncio
  async def test_a_new_contact_keeps_where_its_picked_address_is(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    source = await _synced(session, user, people, session_maker)

    created = await client.post(
      "/v1/contacts",
      json={"source_id": str(source.id), "given_name": "Cia", "addresses": [{"label": "Work", "value": PICKED["formatted"], "address": PICKED}]},
    )

    assert created.status_code == 201, created.text
    [address] = created.json()["addresses"]
    assert (address["latitude"], address["longitude"]) == (59.3307, 18.0631)


PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


@pytest.mark.keep_session_state
class TestPhoto:
  @pytest.mark.asyncio
  async def test_a_new_photo_goes_to_google_and_shows_what_google_stored(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}], phoneNumbers=[MOBILE])
    await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")

    response = await client.put(f"/v1/contacts/{anna.id}/photo", json={"photo": base64.b64encode(PNG).decode()})

    assert response.status_code == 200, response.text
    method, path, _, body = people.writes[-1]
    assert (method, path) == ("PATCH", "people/c1:updateContactPhoto")
    assert body is not None and base64.b64decode(body["photoBytes"]) == PNG
    stored = people.people["people/c1"][0]
    assert response.json()["photo_url"] == stored["photos"][0]["url"]
    assert stored["phoneNumbers"] == [MOBILE], "nothing else changes"
    assert (await _contact(session, "people/c1")).photo_url == stored["photos"][0]["url"]

  @pytest.mark.asyncio
  @pytest.mark.parametrize(
    ("photo", "why"),
    [
      (base64.b64encode(b"GIF89a" + b"\x00" * 16).decode(), "JPEG or PNG"),
      (base64.b64encode(PNG).decode()[:4] + "*" + base64.b64encode(PNG).decode()[4:], "valid base64"),
      (base64.b64encode(PNG + b"\x00" * (2 * 1024 * 1024)).decode(), "2 MB or smaller"),
    ],
  )
  async def test_only_a_jpeg_or_png_up_to_2_mb_is_sent(
    self,
    client: AsyncClient,
    session: AsyncSession,
    user: User,
    people: FakePeople,
    session_maker: SessionMaker,
    redis: Redis,
    photo: str,
    why: str,
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}])
    await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")

    response = await client.put(f"/v1/contacts/{anna.id}/photo", json={"photo": photo})

    assert response.status_code == 422
    assert why in response.text
    assert people.writes == []

  @pytest.mark.asyncio
  async def test_a_jpeg_is_accepted(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}])
    await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")

    response = await client.put(f"/v1/contacts/{anna.id}/photo", json={"photo": base64.b64encode(b"\xff\xd8\xff\xe0" + b"\x00" * 16).decode()})

    assert response.status_code == 200, response.text

  @pytest.mark.asyncio
  async def test_without_permission_no_photo_is_sent(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}])
    await _synced(session, user, people, session_maker, can_edit=False)
    anna = await _contact(session, "people/c1")

    response = await client.put(f"/v1/contacts/{anna.id}/photo", json={"photo": base64.b64encode(PNG).decode()})

    assert response.status_code == 403
    assert people.writes == []

  @pytest.mark.asyncio
  async def test_someone_deleted_in_google_meanwhile_is_gone(
    self, client: AsyncClient, session: AsyncSession, user: User, people: FakePeople, session_maker: SessionMaker, redis: Redis
  ) -> None:
    people.put("people/c1", names=[{"givenName": "Anna"}])
    await _synced(session, user, people, session_maker)
    anna = await _contact(session, "people/c1")
    people.delete("people/c1")

    response = await client.put(f"/v1/contacts/{anna.id}/photo", json={"photo": base64.b64encode(PNG).decode()})

    assert response.status_code == 404
    assert (await client.get("/v1/contacts")).json()["items"] == []


class TestPhones:
  def test_compact_keeps_only_what_is_dialled(self) -> None:
    assert compact_phone("+46 (0)70-123 45 67") == "+46701234567"
    assert compact_phone(" 08.12/34 56 ") == "08123456"
    assert compact_phone("*21*070 123#") == "*21*070123#"
    assert compact_phone("Reception") == "Reception"

  def test_display_spaces_swedish_numbers_nationally_and_others_internationally(self) -> None:
    assert display_phone("+46701234567") == "070-123 45 67"
    assert display_phone("0812345678") == "08-123 456 78"
    assert display_phone("+442079460958") == "+44 20 7946 0958"
    assert display_phone("12") == "12"
    assert display_phone("Reception") == "Reception"
