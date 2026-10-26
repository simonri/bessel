from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
import pytest_asyncio
from api.calendars import http as provider_http
from api.common.encryption import encrypt
from api.contacts.keeping import next_birthday, user_zone
from api.contacts.repository import ContactSourceRepository
from api.contacts.service import sync_source
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.contact import Contact, ContactMethod, ContactMethodKind, ContactSource
from api.models.user import User
from api.settings import settings
from api.tests.people_fake import FakePeople
from cryptography.fernet import Fernet
from httpx import AsyncClient
from pytest_mock import MockerFixture
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

type SessionMaker = Callable[[], AbstractAsyncContextManager[AsyncSession]]

# Tuesday 9 March 2027, 12:00 in Stockholm.
NOW = datetime(2027, 3, 9, 11, tzinfo=UTC)


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch, mocker: MockerFixture) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
  mocker.patch("api.contacts.keeping.utc_now", return_value=NOW)


@pytest_asyncio.fixture
async def stockholm(session: AsyncSession, user: User) -> User:
  user.timezone = "Europe/Stockholm"
  await session.flush()
  return user


async def _account(session: AsyncSession, user: User, email: str = "me@gmail.com") -> CalendarAccount:
  account = CalendarAccount(user_id=user.id, provider=CalendarProvider.google, email=email, encrypted_credentials=encrypt("refresh"), can_read_people=True)
  session.add(account)
  await session.flush()
  return account


async def _contact(session: AsyncSession, user: User, name: str, *, emails: tuple[str, ...] = (), **fields: Any) -> Contact:
  sources = ContactSourceRepository.from_session(session)
  if not await sources.list_for_user(user.id):
    await _account(session, user, f"{user.id}@gmail.com")
  source = (await sources.ensure_for_user(user.id))[0]
  contact = Contact(
    user_id=user.id,
    source_id=source.id,
    resource_name=f"people/{name}",
    person={},
    display_name=name,
    methods=[ContactMethod(kind=ContactMethodKind.email, value=e, position=i) for i, e in enumerate(emails)],
    **fields,
  )
  session.add(contact)
  await session.flush()
  return contact


class _Calendar:
  def __init__(self, session: AsyncSession, calendar: Calendar) -> None:
    self.session = session
    self.calendar = calendar

  async def event(self, title: str, start: datetime | date, **fields: Any) -> CalendarEvent:
    timed = isinstance(start, datetime)
    event = CalendarEvent(
      calendar_id=self.calendar.id,
      external_id=f"{title}-{start.isoformat()}",
      title=title,
      all_day=not timed,
      start_at=start if timed else None,
      end_at=start + timedelta(hours=1) if timed else None,
      start_date=None if timed else start,
      end_date=None if timed else start + timedelta(days=1),
      **fields,
    )
    self.session.add(event)
    await self.session.flush()
    return event


async def _calendar(session: AsyncSession, account: CalendarAccount, *, hidden: bool = False) -> _Calendar:
  calendar = Calendar(account_id=account.id, external_id=f"cal-{hidden}", name="Personal", color="#ff0000", hidden=hidden)
  session.add(calendar)
  await session.flush()
  return _Calendar(session, calendar)


async def _get(client: AsyncClient, contact: Contact) -> dict[str, Any]:
  response = await client.get(f"/v1/contacts/{contact.id}")
  assert response.status_code == 200, response.text
  return response.json()


class TestNextBirthday:
  def test_today_counts_and_a_passed_birthday_comes_next_year(self) -> None:
    assert next_birthday(3, 9, date(2027, 3, 9)) == date(2027, 3, 9)
    assert next_birthday(3, 8, date(2027, 3, 9)) == date(2028, 3, 8)

  def test_wraps_into_january(self) -> None:
    assert next_birthday(1, 3, date(2027, 12, 28)) == date(2028, 1, 3)

  def test_29_february_falls_on_the_28th_outside_leap_years(self) -> None:
    assert next_birthday(2, 29, date(2027, 2, 1)) == date(2027, 2, 28)
    assert next_birthday(2, 29, date(2028, 2, 1)) == date(2028, 2, 29)


class TestUserZone:
  def test_falls_back_to_utc_for_a_zone_that_doesnt_exist(self) -> None:
    assert user_zone(User(timezone="Mars/Olympus")) == ZoneInfo("UTC")
    assert user_zone(User(timezone="Europe/Stockholm")) == ZoneInfo("Europe/Stockholm")


class TestLastSeen:
  @pytest.mark.asyncio
  async def test_the_latest_past_event_they_were_a_guest_on_or_organized(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg", emails=("anna@example.com",))
    await calendar.event("Planning", datetime(2027, 2, 1, 9, tzinfo=UTC), attendees=[{"email": "ANNA@example.com", "response": "accepted"}])
    await calendar.event("Retro", datetime(2027, 3, 2, 9, tzinfo=UTC), creator_email="Anna@Example.com")
    await calendar.event("Next week", datetime(2027, 3, 16, 9, tzinfo=UTC), attendees=[{"email": "anna@example.com", "response": "accepted"}])
    await calendar.event("Her birthday", date(2027, 3, 14), creator_email="anna@example.com")

    assert (await _get(client, anna))["last_seen"] == {"on": "2027-03-02", "event_title": "Retro"}

  @pytest.mark.asyncio
  async def test_not_on_events_either_side_declined_or_on_hidden_calendars(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    account = await _account(session, stockholm)
    calendar = await _calendar(session, account)
    hidden = await _calendar(session, account, hidden=True)
    anna = await _contact(session, stockholm, "Anna Berg", emails=("anna@example.com",))
    guest = [{"email": "anna@example.com", "response": "accepted"}]
    await calendar.event("Seen", datetime(2027, 1, 5, 9, tzinfo=UTC), attendees=[{"email": "Anna@Example.com", "response": "accepted"}])
    await calendar.event("She declined", datetime(2027, 2, 1, 9, tzinfo=UTC), attendees=[{"email": "anna@example.com", "response": "declined"}])
    await calendar.event("I declined", datetime(2027, 2, 2, 9, tzinfo=UTC), attendees=guest, my_response="declined")
    await hidden.event("Hidden", datetime(2027, 2, 3, 9, tzinfo=UTC), attendees=guest)

    assert (await _get(client, anna))["last_seen"] == {"on": "2027-01-05", "event_title": "Seen"}

  @pytest.mark.asyncio
  async def test_named_in_a_title_as_a_whole_name_but_short_names_never_match(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg")
    bo = await _contact(session, stockholm, "Bo")
    await calendar.event("Lunch med anna berg", date(2027, 2, 20))
    await calendar.event("Anna Bergström's vernissage", date(2027, 3, 1))
    await calendar.event("Bo", date(2027, 3, 1))

    assert (await _get(client, anna))["last_seen"] == {"on": "2027-02-20", "event_title": "Lunch med anna berg"}
    assert (await _get(client, bo))["last_seen"] is None

  @pytest.mark.asyncio
  async def test_the_day_is_the_users_own(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg")
    await calendar.event("Late drinks with Anna Berg", datetime(2027, 3, 1, 23, 30, tzinfo=UTC))

    assert (await _get(client, anna))["last_seen"]["on"] == "2027-03-02"

  @pytest.mark.asyncio
  async def test_a_later_catch_up_wins_over_the_calendar_and_an_earlier_one_doesnt(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg", caught_up_on=date(2027, 3, 5))
    bo = await _contact(session, stockholm, "Bo Ek", caught_up_on=date(2027, 1, 1))
    await calendar.event("Fika with Anna Berg", date(2027, 2, 1))
    await calendar.event("Fika with Bo Ek", date(2027, 2, 1))

    assert (await _get(client, anna))["last_seen"] == {"on": "2027-03-05", "event_title": None}
    assert (await _get(client, bo))["last_seen"] == {"on": "2027-02-01", "event_title": "Fika with Bo Ek"}

  @pytest.mark.asyncio
  async def test_another_users_calendar_says_nothing_about_my_contacts(
    self, client: AsyncClient, session: AsyncSession, stockholm: User, other_user: User
  ) -> None:
    anna = await _contact(session, stockholm, "Anna Berg", emails=("anna@example.com",))
    theirs = await _calendar(session, await _account(session, other_user, "them@gmail.com"))
    await theirs.event("Lunch with Anna Berg", date(2027, 3, 1), attendees=[{"email": "anna@example.com", "response": "accepted"}])

    assert (await _get(client, anna))["last_seen"] is None


class TestKeepUp:
  @pytest.mark.asyncio
  async def test_tags_are_trimmed_kept_once_and_cleared_by_null(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    anna = await _contact(session, stockholm, "Anna Berg")

    tagged = await client.patch(f"/v1/contacts/{anna.id}/keep-up", json={"tags": [" Climbing ", "climbing", "Lund"]})
    cleared = await client.patch(f"/v1/contacts/{anna.id}/keep-up", json={"tags": None})

    assert tagged.json()["tags"] == ["Climbing", "Lund"]
    assert cleared.json()["tags"] == []

  @pytest.mark.asyncio
  async def test_catching_up_moves_the_next_catch_up_and_leaving_a_field_out_keeps_it(
    self, client: AsyncClient, session: AsyncSession, stockholm: User
  ) -> None:
    anna = await _contact(session, stockholm, "Anna Berg", tags=["Climbing"])

    never_seen = await client.patch(f"/v1/contacts/{anna.id}/keep-up", json={"keep_in_touch_days": 30})
    caught_up = await client.patch(f"/v1/contacts/{anna.id}/keep-up", json={"caught_up_on": "2027-03-09"})

    assert never_seen.json()["catch_up_on"] == "2027-03-09"
    assert caught_up.json()["catch_up_on"] == "2027-04-08"
    assert caught_up.json()["keep_in_touch_days"] == 30
    assert caught_up.json()["tags"] == ["Climbing"]

  @pytest.mark.asyncio
  async def test_refuses_a_zero_interval(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    anna = await _contact(session, stockholm, "Anna Berg")

    assert (await client.patch(f"/v1/contacts/{anna.id}/keep-up", json={"keep_in_touch_days": 0})).status_code == 422

  @pytest.mark.asyncio
  async def test_survives_every_kind_of_sync(self, client: AsyncClient, session: AsyncSession, stockholm: User, monkeypatch: pytest.MonkeyPatch) -> None:
    people = FakePeople()
    monkeypatch.setattr(provider_http, "client", lambda: httpx.AsyncClient(transport=people.transport()))

    @asynccontextmanager
    async def session_maker() -> AsyncIterator[AsyncSession]:
      yield session
      await session.flush()

    await _account(session, stockholm)
    source: ContactSource = (await ContactSourceRepository.from_session(session).ensure_for_user(stockholm.id))[0]
    people.put("people/c1", names=[{"displayName": "Anna Berg"}])
    await sync_source(session_maker, source.id)
    anna = (await session.execute(select(Contact).where(Contact.source_id == source.id))).scalar_one()
    await client.patch(f"/v1/contacts/{anna.id}/keep-up", json={"tags": ["Climbing"], "keep_in_touch_days": 30, "caught_up_on": "2027-03-01"})

    people.put("people/c1", names=[{"displayName": "Anna Lind"}])
    await sync_source(session_maker, source.id)
    after_changes = await _get(client, anna)
    source.sync_token = None
    await sync_source(session_maker, source.id)
    after_full_sync = await _get(client, anna)

    for synced in (after_changes, after_full_sync):
      assert synced["display_name"] == "Anna Lind"
      assert (synced["tags"], synced["keep_in_touch_days"], synced["caught_up_on"]) == (["Climbing"], 30, "2027-03-01")

  @pytest.mark.asyncio
  async def test_another_users_contact_cant_be_changed(self, client: AsyncClient, session: AsyncSession, other_user: User) -> None:
    await _account(session, other_user, "them@gmail.com")
    theirs = await _contact(session, other_user, "Anna Berg")

    response = await client.patch(f"/v1/contacts/{theirs.id}/keep-up", json={"tags": ["Mine"]})

    assert response.status_code == 404
    stored = select(Contact.tags).where(Contact.id == theirs.id)
    assert (await session.execute(stored)).scalar_one() == []


class TestReminders:
  @pytest.mark.asyncio
  async def test_birthdays_within_the_window_soonest_first(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    await _contact(session, stockholm, "Last day", birthday_month=3, birthday_day=15, birthday_year=1990)
    await _contact(session, stockholm, "Today", birthday_month=3, birthday_day=9)
    await _contact(session, stockholm, "Too late", birthday_month=3, birthday_day=16)
    await _contact(session, stockholm, "Yesterday", birthday_month=3, birthday_day=8)

    response = await client.get("/v1/contacts/reminders", params={"days": 7})

    assert response.status_code == 200, response.text
    assert [(b["contact"]["display_name"], b["on"], b["turns"]) for b in response.json()["birthdays"]] == [
      ("Today", "2027-03-09", None),
      ("Last day", "2027-03-15", 37),
    ]

  @pytest.mark.asyncio
  async def test_catch_up_lists_only_who_is_due_longest_overdue_first(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    await _contact(session, stockholm, "Due today", keep_in_touch_days=30, caught_up_on=date(2027, 2, 7))
    await _contact(session, stockholm, "Not yet", keep_in_touch_days=30, caught_up_on=date(2027, 2, 8))
    await _contact(session, stockholm, "Overdue", keep_in_touch_days=7)
    await _contact(session, stockholm, "Not keeping", caught_up_on=date(2020, 1, 1))
    await calendar.event("Dinner with Overdue", date(2027, 2, 1))

    catch_up = (await client.get("/v1/contacts/reminders")).json()["catch_up"]

    assert [(c["contact"]["display_name"], c["due_on"], c["last_seen"]) for c in catch_up] == [
      ("Overdue", "2027-02-08", {"on": "2027-02-01", "event_title": "Dinner with Overdue"}),
      ("Due today", "2027-03-09", {"on": "2027-02-07", "event_title": None}),
    ]

  @pytest.mark.asyncio
  async def test_only_the_users_own_contacts(self, client: AsyncClient, session: AsyncSession, other_user: User) -> None:
    await _account(session, other_user, "them@gmail.com")
    await _contact(session, other_user, "Theirs", birthday_month=3, birthday_day=9, keep_in_touch_days=1)

    assert (await client.get("/v1/contacts/reminders")).json() == {"birthdays": [], "catch_up": []}
