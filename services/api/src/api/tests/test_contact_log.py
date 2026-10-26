from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
import pytest_asyncio
from api.calendars import http as provider_http
from api.common.encryption import encrypt
from api.contacts.keeping import Matcher, next_occurrence, user_zone
from api.contacts.repository import ContactRepository, ContactSourceRepository
from api.contacts.service import sync_source
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.contact import Contact, ContactInteraction, ContactInteractionKind, ContactInteractionSource, ContactMethod, ContactMethodKind, ContactSource
from api.models.user import User
from api.settings import settings
from api.tests.people_fake import FakePeople
from cryptography.fernet import Fernet
from httpx import AsyncClient
from pytest_mock import MockerFixture
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Tuesday 9 March 2027, 12:00 in Stockholm.
NOW = datetime(2027, 3, 9, 11, tzinfo=UTC)
ME = "me@gmail.com"


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch, mocker: MockerFixture) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())
  mocker.patch("api.contacts.keeping.utc_now", return_value=NOW)


@pytest_asyncio.fixture
async def stockholm(session: AsyncSession, user: User) -> User:
  user.timezone = "Europe/Stockholm"
  await session.flush()
  return user


async def _account(session: AsyncSession, user: User, email: str = ME) -> CalendarAccount:
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
    person=fields.pop("person", {}),
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


async def _timeline(client: AsyncClient, contact: Contact) -> list[tuple[str, str, str | None, str | None]]:
  response = await client.get(f"/v1/contacts/{contact.id}/interactions")
  assert response.status_code == 200, response.text
  return [(e["occurred_on"], e["kind"], e["event_title"], e["note"]) for e in response.json()]


def _person(name: str, *, given: str | None = None, emails: tuple[str, ...] = ()) -> Contact:
  return Contact(
    display_name=name,
    given_name=given,
    person={},
    methods=[ContactMethod(kind=ContactMethodKind.email, value=e, position=i) for i, e in enumerate(emails)],
  )


def _event(title: str, *, attendees: list[dict[str, Any]] | None = None, creator_email: str | None = None) -> CalendarEvent:
  return CalendarEvent(title=title, attendees=attendees or [], creator_email=creator_email)


class TestNextOccurrence:
  def test_today_counts_and_a_passed_date_comes_next_year(self) -> None:
    assert next_occurrence(3, 9, date(2027, 3, 9)) == date(2027, 3, 9)
    assert next_occurrence(3, 8, date(2027, 3, 9)) == date(2028, 3, 8)

  def test_wraps_into_january(self) -> None:
    assert next_occurrence(1, 3, date(2027, 12, 28)) == date(2028, 1, 3)

  def test_29_february_falls_on_the_28th_outside_leap_years(self) -> None:
    assert next_occurrence(2, 29, date(2027, 2, 1)) == date(2027, 2, 28)
    assert next_occurrence(2, 29, date(2028, 2, 1)) == date(2028, 2, 29)


class TestUserZone:
  def test_falls_back_to_utc_for_a_zone_that_doesnt_exist(self) -> None:
    assert user_zone(User(timezone="Mars/Olympus")) == ZoneInfo("UTC")
    assert user_zone(User(timezone="Europe/Stockholm")) == ZoneInfo("Europe/Stockholm")


class TestMatcher:
  def test_surely_there_as_a_guest_organizer_guest_name_or_full_name_in_the_title(self) -> None:
    anna = _person("Anna Berg", given="Anna", emails=("anna@example.com",))
    matcher = Matcher([anna], {ME})

    assert matcher.match(_event("Planning", attendees=[{"email": "ANNA@example.com", "response": "accepted"}])) == {anna.id: True}
    assert matcher.match(_event("Retro", creator_email="Anna@Example.com")) == {anna.id: True}
    assert matcher.match(_event("Board", attendees=[{"email": "a.b@work.se", "name": "anna berg"}])) == {anna.id: True}
    assert matcher.match(_event("Lunch med anna berg")) == {anna.id: True}

  def test_not_as_a_guest_who_declined_nor_inside_a_longer_name(self) -> None:
    anna = _person("Anna Berg", given="Anna", emails=("anna@example.com",))
    other = _person("Anna Lind", given="Anna")
    matcher = Matcher([anna, other], {ME})

    assert matcher.match(_event("Planning", attendees=[{"email": "anna@example.com", "response": "declined"}])) == {}
    assert matcher.match(_event("Anna Bergström's vernissage")) == {}

  def test_possibly_there_when_named_by_a_first_name_no_one_else_has(self) -> None:
    anna = _person("Anna Berg", given="Anna")
    mamma = _person("Mamma")
    matcher = Matcher([anna, mamma], {ME})

    assert matcher.match(_event("Lunch with Anna")) == {anna.id: False}
    assert matcher.match(_event("Middag hos mamma")) == {mamma.id: False}

  def test_never_by_a_shared_or_short_first_name(self) -> None:
    anna, also_anna, bo = _person("Anna Berg", given="Anna"), _person("Anna Lind", given="Anna"), _person("Bo Ek", given="Bo")
    matcher = Matcher([anna, also_anna, bo], {ME})

    assert matcher.match(_event("Lunch with Anna")) == {}
    assert matcher.match(_event("Fika with Bo")) == {}

  def test_never_the_user_themselves(self) -> None:
    me = _person("Simon Risberg", given="Simon", emails=("ME@gmail.com",))
    anna = _person("Anna Berg", emails=("anna@example.com",))
    matcher = Matcher([me, anna], {ME})

    own = _event("Simon Risberg - dentist", attendees=[{"email": ME, "is_self": True}], creator_email=ME)
    shared = _event("Sync", attendees=[{"email": "anna@example.com", "is_self": True, "name": "Anna Berg"}])
    assert matcher.match(own) == {}
    assert matcher.match(shared) == {}, "an attendee marked as the user is the user, whatever the address"


class TestLastSeen:
  @pytest.mark.asyncio
  async def test_the_latest_of_the_log_and_the_past_events_they_were_surely_at(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg", emails=("anna@example.com",))
    bo = await _contact(session, stockholm, "Bo Ek")
    await calendar.event("Retro", datetime(2027, 3, 2, 9, tzinfo=UTC), creator_email="anna@example.com")
    await calendar.event("Next week", datetime(2027, 3, 16, 9, tzinfo=UTC), creator_email="anna@example.com")
    await calendar.event("Fika with Bo Ek", date(2027, 2, 1))
    await client.post(f"/v1/contacts/{anna.id}/interactions", json={"occurred_on": "2027-02-20", "note": "Coffee"})
    await client.post(f"/v1/contacts/{bo.id}/interactions", json={"occurred_on": "2027-03-05", "kind": "call", "note": "Called about the boat"})

    assert (await _get(client, anna))["last_seen"] == {"on": "2027-03-02", "kind": "event", "summary": "Retro"}
    assert (await _get(client, bo))["last_seen"] == {"on": "2027-03-05", "kind": "call", "summary": "Called about the boat"}

  @pytest.mark.asyncio
  async def test_not_events_the_user_declined_or_on_hidden_calendars(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    account = await _account(session, stockholm)
    calendar = await _calendar(session, account)
    hidden = await _calendar(session, account, hidden=True)
    anna = await _contact(session, stockholm, "Anna Berg")
    await calendar.event("Anna Berg intro", date(2027, 1, 5))
    await calendar.event("Anna Berg declined", date(2027, 2, 2), my_response="declined")
    await hidden.event("Anna Berg hidden", date(2027, 2, 3))

    assert (await _get(client, anna))["last_seen"]["summary"] == "Anna Berg intro"

  @pytest.mark.asyncio
  async def test_the_day_is_the_users_own(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg")
    await calendar.event("Late drinks with Anna Berg", datetime(2027, 3, 1, 23, 30, tzinfo=UTC))

    assert (await _get(client, anna))["last_seen"]["on"] == "2027-03-02"

  @pytest.mark.asyncio
  async def test_another_users_calendar_says_nothing_about_my_contacts(
    self, client: AsyncClient, session: AsyncSession, stockholm: User, other_user: User
  ) -> None:
    anna = await _contact(session, stockholm, "Anna Berg", emails=("anna@example.com",))
    theirs = await _calendar(session, await _account(session, other_user, "them@gmail.com"))
    await theirs.event("Lunch with Anna Berg", date(2027, 3, 1), attendees=[{"email": "anna@example.com", "response": "accepted"}])

    assert (await _get(client, anna))["last_seen"] is None


class TestLog:
  @pytest.mark.asyncio
  async def test_logs_today_as_a_meeting_unless_told_otherwise(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    anna = await _contact(session, stockholm, "Anna Berg")

    plain = await client.post(f"/v1/contacts/{anna.id}/interactions", json={})
    called = await client.post(f"/v1/contacts/{anna.id}/interactions", json={"kind": "call", "note": "  Moving to Berlin  ", "occurred_on": "2027-03-01"})

    assert plain.status_code == 201, plain.text
    assert (plain.json()["occurred_on"], plain.json()["kind"], plain.json()["source"], plain.json()["note"]) == ("2027-03-09", "met", "manual", None)
    assert (called.json()["kind"], called.json()["note"]) == ("call", "Moving to Berlin")
    assert await _timeline(client, anna) == [("2027-03-09", "met", None, None), ("2027-03-01", "call", None, "Moving to Berlin")]

  @pytest.mark.asyncio
  async def test_refuses_a_day_that_hasnt_happened(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    anna = await _contact(session, stockholm, "Anna Berg")

    response = await client.post(f"/v1/contacts/{anna.id}/interactions", json={"occurred_on": "2027-03-10"})

    assert response.status_code == 422

  @pytest.mark.asyncio
  async def test_logging_an_event_takes_its_day_and_title_and_again_only_updates_the_note(
    self, client: AsyncClient, session: AsyncSession, stockholm: User
  ) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg")
    lunch = await calendar.event("Lunch", datetime(2027, 3, 8, 11, tzinfo=UTC))

    first = await client.post(f"/v1/contacts/{anna.id}/interactions", json={"calendar_event_id": str(lunch.id), "kind": "call"})
    again = await client.post(f"/v1/contacts/{anna.id}/interactions", json={"calendar_event_id": str(lunch.id), "note": "She got the job"})

    assert (first.json()["occurred_on"], first.json()["kind"], first.json()["event_title"]) == ("2027-03-08", "event", "Lunch")
    assert again.json()["id"] == first.json()["id"]
    assert await _timeline(client, anna) == [("2027-03-08", "event", "Lunch", "She got the job")]

  @pytest.mark.asyncio
  async def test_the_timeline_adds_events_they_were_surely_at_once(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg")
    logged = await calendar.event("Dinner with Anna Berg", date(2027, 3, 1))
    await calendar.event("Anna Berg 1:1", date(2027, 2, 1))
    await calendar.event("Lunch with Anna", date(2027, 2, 15))
    await client.post(f"/v1/contacts/{anna.id}/interactions", json={"calendar_event_id": str(logged.id), "note": "Great"})

    entries = (await client.get(f"/v1/contacts/{anna.id}/interactions")).json()

    assert [(e["occurred_on"], e["event_title"], e["source"], e["id"] is None) for e in entries] == [
      ("2027-03-01", "Dinner with Anna Berg", "manual", False),
      ("2027-02-01", "Anna Berg 1:1", "calendar", True),
    ]

  @pytest.mark.asyncio
  async def test_deletes_an_entry(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    anna = await _contact(session, stockholm, "Anna Berg")
    entry = (await client.post(f"/v1/contacts/{anna.id}/interactions", json={"note": "Oops"})).json()

    response = await client.delete(f"/v1/contacts/{anna.id}/interactions/{entry['id']}")

    assert response.status_code == 204
    assert await _timeline(client, anna) == []

  @pytest.mark.asyncio
  async def test_nothing_of_another_users_can_be_logged_read_or_deleted(
    self, client: AsyncClient, session: AsyncSession, stockholm: User, other_user: User
  ) -> None:
    theirs = await _contact(session, other_user, "Anna Berg")
    their_entry = ContactInteraction(
      user_id=other_user.id, contact_id=theirs.id, occurred_on=date(2027, 3, 1), kind=ContactInteractionKind.met, source=ContactInteractionSource.manual
    )
    session.add(their_entry)
    their_event = await (await _calendar(session, await _account(session, other_user, "them@gmail.com"))).event("Their lunch", date(2027, 3, 1))
    mine = await _contact(session, stockholm, "Bo Ek")

    assert (await client.post(f"/v1/contacts/{theirs.id}/interactions", json={})).status_code == 404
    assert (await client.get(f"/v1/contacts/{theirs.id}/interactions")).status_code == 404
    assert (await client.delete(f"/v1/contacts/{theirs.id}/interactions/{their_entry.id}")).status_code == 404
    assert (await client.delete(f"/v1/contacts/{mine.id}/interactions/{their_entry.id}")).status_code == 404
    assert (await client.post(f"/v1/contacts/{mine.id}/interactions", json={"calendar_event_id": str(their_event.id)})).status_code == 404
    assert (await session.execute(select(ContactInteraction.id).where(ContactInteraction.id == their_entry.id))).scalar_one_or_none() == their_entry.id


class TestFollowUps:
  @pytest.mark.asyncio
  async def test_asks_for_a_note_after_an_event_with_someone_surely_there_for_three_days(
    self, client: AsyncClient, session: AsyncSession, stockholm: User
  ) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg", emails=("anna@example.com",))
    guest = [{"email": "anna@example.com", "response": "accepted"}]
    ended = await calendar.event("Planning", datetime(2027, 3, 9, 9, tzinfo=UTC), attendees=guest)
    await calendar.event("Still on", datetime(2027, 3, 9, 10, 30, tzinfo=UTC), attendees=guest)
    await calendar.event("Too long ago", datetime(2027, 3, 6, 9, tzinfo=UTC), attendees=guest)

    follow_ups = (await client.get("/v1/contacts/follow-ups")).json()

    assert follow_ups == [
      {
        "kind": "note",
        "contact": {"id": str(anna.id), "display_name": "Anna Berg", "photo_url": None},
        "event": {"id": str(ended.id), "title": "Planning", "on": "2027-03-09"},
      }
    ]

  @pytest.mark.asyncio
  async def test_asks_whether_someone_named_by_first_name_was_there_for_a_month(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    await _contact(session, stockholm, "Anna Berg", given_name="Anna")
    lunch = await calendar.event("Lunch with Anna", date(2027, 2, 20))
    await calendar.event("Fika with Anna", date(2027, 2, 1))

    follow_ups = (await client.get("/v1/contacts/follow-ups")).json()

    assert [(f["kind"], f["event"]["id"]) for f in follow_ups] == [("confirm", str(lunch.id))]

  @pytest.mark.asyncio
  async def test_an_answer_settles_it_logged_or_dismissed(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg", given_name="Anna", emails=("anna@example.com",))
    bo = await _contact(session, stockholm, "Bo Ekdahl", given_name="Bosse")
    planning = await calendar.event("Planning", datetime(2027, 3, 9, 9, tzinfo=UTC), attendees=[{"email": "anna@example.com"}])
    fika = await calendar.event("Fika with Bosse", date(2027, 3, 1))
    assert len((await client.get("/v1/contacts/follow-ups")).json()) == 2

    logged = await client.post(f"/v1/contacts/{anna.id}/interactions", json={"calendar_event_id": str(planning.id)})
    dismissed = await client.post(f"/v1/contacts/{bo.id}/dismissals", json={"calendar_event_id": str(fika.id)})

    assert (logged.status_code, dismissed.status_code) == (201, 204)
    assert (await client.get("/v1/contacts/follow-ups")).json() == []
    assert (await client.post(f"/v1/contacts/{bo.id}/dismissals", json={"calendar_event_id": str(fika.id)})).status_code == 204

  @pytest.mark.asyncio
  async def test_nothing_from_another_users_calendar(self, client: AsyncClient, session: AsyncSession, stockholm: User, other_user: User) -> None:
    await _contact(session, stockholm, "Anna Berg", emails=("anna@example.com",))
    theirs = await _calendar(session, await _account(session, other_user, "them@gmail.com"))
    their_event = await theirs.event("Planning", datetime(2027, 3, 9, 9, tzinfo=UTC), attendees=[{"email": "anna@example.com"}])
    mine = await _contact(session, stockholm, "Bo Ek")

    assert (await client.get("/v1/contacts/follow-ups")).json() == []
    assert (await client.post(f"/v1/contacts/{mine.id}/dismissals", json={"calendar_event_id": str(their_event.id)})).status_code == 404


class TestBrief:
  @pytest.mark.asyncio
  async def test_names_who_is_coming_surely_first_with_what_was_logged_and_dates_ahead(
    self, client: AsyncClient, session: AsyncSession, stockholm: User
  ) -> None:
    calendar = await _calendar(session, await _account(session, stockholm))
    anna = await _contact(session, stockholm, "Anna Berg", emails=("anna@example.com",), birthday_month=3, birthday_day=15, birthday_year=1990)
    ada = await _contact(session, stockholm, "Ada Ny", given_name="Ada")
    await _contact(session, stockholm, "Bo Ek")
    meeting = await calendar.event("Planning with Ada", datetime(2027, 3, 10, 9, tzinfo=UTC), attendees=[{"email": "anna@example.com"}])
    for day in ("2027-01-01", "2027-02-01", "2027-03-01", "2027-03-02"):
      await client.post(f"/v1/contacts/{anna.id}/interactions", json={"occurred_on": day, "note": day})

    response = await client.get("/v1/contacts/brief", params={"calendar_event_id": str(meeting.id)})

    assert response.status_code == 200, response.text
    brief = response.json()
    assert brief["event"] == {"id": str(meeting.id), "title": "Planning with Ada", "on": "2027-03-10"}
    assert [(p["contact"]["id"], p["sure"]) for p in brief["people"]] == [(str(anna.id), True), (str(ada.id), False)]
    first = brief["people"][0]
    assert [e["note"] for e in first["recent"]] == ["2027-03-02", "2027-03-01", "2027-02-01"]
    assert first["last_seen"]["on"] == "2027-03-02"
    assert (first["upcoming"]["label"], first["upcoming"]["on"], first["upcoming"]["years"]) == ("Birthday", "2027-03-15", 37)

  @pytest.mark.asyncio
  async def test_not_for_another_users_event(self, client: AsyncClient, session: AsyncSession, other_user: User) -> None:
    theirs = await (await _calendar(session, await _account(session, other_user, "them@gmail.com"))).event("Theirs", date(2027, 3, 1))

    assert (await client.get("/v1/contacts/brief", params={"calendar_event_id": str(theirs.id)})).status_code == 404


class TestDates:
  @pytest.mark.asyncio
  async def test_birthdays_and_other_dates_within_the_window_soonest_first(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    anniversary = {"events": [{"date": {"year": 2015, "month": 3, "day": 12}, "type": "anniversary", "formattedType": "Anniversary"}]}
    name_day = {"events": [{"date": {"year": 0, "month": 3, "day": 10}, "type": "Namnsdag"}]}
    await _contact(session, stockholm, "Last day", birthday_month=3, birthday_day=15, birthday_year=1990)
    await _contact(session, stockholm, "Today", birthday_month=3, birthday_day=9)
    await _contact(session, stockholm, "Too late", birthday_month=3, birthday_day=16)
    await _contact(session, stockholm, "Married", person=anniversary)
    await _contact(session, stockholm, "Named", person=name_day)

    response = await client.get("/v1/contacts/reminders", params={"days": 7})

    assert response.status_code == 200, response.text
    assert [(d["contact"]["display_name"], d["label"], d["on"], d["years"]) for d in response.json()["dates"]] == [
      ("Today", "Birthday", "2027-03-09", None),
      ("Named", "Namnsdag", "2027-03-10", None),
      ("Married", "Anniversary", "2027-03-12", 12),
      ("Last day", "Birthday", "2027-03-15", 37),
    ]

  @pytest.mark.asyncio
  async def test_a_contact_shows_its_other_dates(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    anniversary = {
      "events": [
        {"date": {"year": 2015, "month": 6, "day": 1}, "formattedType": "Anniversary"},
        {"date": {"year": 0, "month": 8, "day": 2}, "type": "other"},
        {"date": {"year": 2020}},
      ]
    }
    married = await _contact(session, stockholm, "Married", person=anniversary)

    assert (await _get(client, married))["dates"] == [
      {"label": "Anniversary", "month": 6, "day": 1, "year": 2015},
      {"label": "Other", "month": 8, "day": 2, "year": None},
    ]

  @pytest.mark.asyncio
  async def test_only_the_users_own_contacts(self, client: AsyncClient, session: AsyncSession, other_user: User) -> None:
    await _contact(session, other_user, "Theirs", birthday_month=3, birthday_day=9)

    assert (await client.get("/v1/contacts/reminders")).json() == {"dates": []}


class TestTags:
  @pytest.mark.asyncio
  async def test_tags_are_trimmed_and_kept_once(self, client: AsyncClient, session: AsyncSession, stockholm: User) -> None:
    anna = await _contact(session, stockholm, "Anna Berg")

    tagged = await client.put(f"/v1/contacts/{anna.id}/tags", json={"tags": [" Climbing ", "climbing", "Lund"]})
    cleared = await client.put(f"/v1/contacts/{anna.id}/tags", json={"tags": []})

    assert tagged.json()["tags"] == ["Climbing", "Lund"]
    assert cleared.json()["tags"] == []

  @pytest.mark.asyncio
  async def test_another_users_contact_cant_be_tagged(self, client: AsyncClient, session: AsyncSession, other_user: User) -> None:
    theirs = await _contact(session, other_user, "Anna Berg")

    assert (await client.put(f"/v1/contacts/{theirs.id}/tags", json={"tags": ["Mine"]})).status_code == 404
    assert (await session.execute(select(Contact.tags).where(Contact.id == theirs.id))).scalar_one() == []

  @pytest.mark.asyncio
  async def test_tags_and_the_log_survive_every_kind_of_sync(
    self, client: AsyncClient, session: AsyncSession, stockholm: User, monkeypatch: pytest.MonkeyPatch
  ) -> None:
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
    await client.put(f"/v1/contacts/{anna.id}/tags", json={"tags": ["Climbing"]})
    await client.post(f"/v1/contacts/{anna.id}/interactions", json={"note": "Climbed"})

    people.put("people/c1", names=[{"displayName": "Anna Lind"}])
    await sync_source(session_maker, source.id)
    after_changes = await _get(client, anna)
    source.sync_token = None
    await sync_source(session_maker, source.id)
    after_full_sync = await _get(client, anna)

    for synced in (after_changes, after_full_sync):
      assert (synced["display_name"], synced["tags"], synced["last_seen"]["summary"]) == ("Anna Lind", ["Climbing"], "Climbed")


class TestPurge:
  @pytest.mark.asyncio
  async def test_a_contact_deleted_a_month_ago_goes_with_its_log(self, session: AsyncSession, user: User) -> None:
    gone = await _contact(session, user, "Gone", deleted_at=datetime(2027, 1, 1, tzinfo=UTC))
    recent = await _contact(session, user, "Recent", deleted_at=datetime(2027, 3, 1, tzinfo=UTC))
    live = await _contact(session, user, "Live")
    for contact in (gone, recent, live):
      session.add(
        ContactInteraction(
          user_id=user.id, contact_id=contact.id, occurred_on=date(2026, 12, 1), kind=ContactInteractionKind.met, source=ContactInteractionSource.manual
        )
      )
    await session.flush()

    purged = await ContactRepository.from_session(session).purge_deleted(datetime(2027, 2, 7, tzinfo=UTC))

    assert purged == 1
    remaining = (await session.execute(select(ContactInteraction.contact_id))).scalars().all()
    assert sorted(map(str, remaining)) == sorted([str(recent.id), str(live.id)])
