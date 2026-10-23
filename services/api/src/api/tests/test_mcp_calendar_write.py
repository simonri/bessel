from collections.abc import Iterator
from datetime import date
from typing import Any

import httpx
import pytest
import pytest_asyncio
from api.calendars import http as provider_http
from api.common.encryption import encrypt
from api.mcp.tools import calendar as calendar_tools
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.user import User
from api.postgres import AsyncSession
from api.settings import settings
from api.tests.calendar_fakes import FakeGoogleCalendar
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error
from cryptography.fernet import Fernet

TODAY = date(2026, 10, 23)


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture
def google(monkeypatch: pytest.MonkeyPatch) -> Iterator[FakeGoogleCalendar]:
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "id")
  monkeypatch.setattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "secret")
  monkeypatch.setattr(calendar_tools, "today_in", lambda tz: TODAY)
  fake = FakeGoogleCalendar()
  monkeypatch.setattr(provider_http, "client", lambda: httpx.AsyncClient(transport=fake.transport()))
  yield fake


@pytest_asyncio.fixture(autouse=True)
async def in_stockholm(session: AsyncSession, user: User, other_user: User) -> None:
  user.timezone = other_user.timezone = "Europe/Stockholm"
  await session.flush()


async def _calendars(save_fixture: SaveFixture, user: User, *, can_write: bool = True) -> dict[str, Calendar]:
  account = CalendarAccount(
    user_id=user.id, provider=CalendarProvider.google, email="me@gmail.com", encrypted_credentials=encrypt("secret"), can_write=can_write
  )
  await save_fixture(account)
  calendars = {}
  for name, writable in (("Företag", True), ("Privat", True), ("Helgdagar i Sverige", False)):
    calendars[name] = Calendar(account_id=account.id, external_id=f"{name}@group", name=name, color="#4285f4", writable=writable)
    await save_fixture(calendars[name])
  return calendars


def _created(google: FakeGoogleCalendar) -> list[tuple[str, dict[str, Any]]]:
  return [(r.path.split("/")[4], r.body or {}) for r in google.writes() if r.method == "POST"]


class TestListCalendars:
  @pytest.mark.asyncio
  async def test_says_which_calendars_take_new_events(self, connect: ConnectFixture, save_fixture: SaveFixture, user: User) -> None:
    await _calendars(save_fixture, user)

    calendars = (await mcp_call(connect, "list_calendars"))["calendars"]

    assert [(c["name"], c["account"], c["can_add_events"]) for c in calendars] == [
      ("Företag", "me@gmail.com", True),
      ("Helgdagar i Sverige", "me@gmail.com", False),
      ("Privat", "me@gmail.com", True),
    ]
    assert (await mcp_call(connect, "list_calendars", token="token-b"))["calendars"] == []

  @pytest.mark.asyncio
  async def test_an_account_without_write_access_takes_none(self, connect: ConnectFixture, save_fixture: SaveFixture, user: User) -> None:
    await _calendars(save_fixture, user, can_write=False)

    calendars = (await mcp_call(connect, "list_calendars"))["calendars"]

    assert {c["can_add_events"] for c in calendars} == {False}


class TestAddCalendarEvents:
  @pytest.mark.asyncio
  async def test_adds_all_day_and_timed_events_without_inviting_anyone(
    self, connect: ConnectFixture, save_fixture: SaveFixture, user: User, google: FakeGoogleCalendar
  ) -> None:
    await _calendars(save_fixture, user)

    result = await mcp_call(
      connect,
      "add_calendar_events",
      {
        "events": [
          {"calendar": "företag", "title": "Momsdeklaration Q3", "day": "2026-11-12", "description": "Lämna och betala."},
          {"calendar": "Privat", "title": "Tandläkare", "day": "fri", "start_time": "14:00", "location": "Kungsgatan 1"},
          {"calendar": "Privat", "title": "Fjällen", "day": "2026-12-27", "last_day": "2026-12-30"},
        ]
      },
    )

    assert result == {
      "added": [
        {"calendar": "Företag", "title": "Momsdeklaration Q3", "start": "2026-11-12"},
        {"calendar": "Privat", "title": "Tandläkare", "start": "2026-10-30T14:00:00+01:00"},
        {"calendar": "Privat", "title": "Fjällen", "start": "2026-12-27"},
      ],
      "already_there": [],
    }
    created = _created(google)
    assert [(calendar, body["summary"], body["start"], body["end"], body.get("transparency")) for calendar, body in created] == [
      ("Företag@group", "Momsdeklaration Q3", {"date": "2026-11-12"}, {"date": "2026-11-13"}, "transparent"),
      (
        "Privat@group",
        "Tandläkare",
        {"dateTime": "2026-10-30T14:00:00", "timeZone": "Europe/Stockholm"},
        {"dateTime": "2026-10-30T15:00:00", "timeZone": "Europe/Stockholm"},
        "opaque",
      ),
      ("Privat@group", "Fjällen", {"date": "2026-12-27"}, {"date": "2026-12-31"}, "transparent"),
    ]
    assert (created[0][1]["description"], created[1][1]["location"]) == ("Lämna och betala.", "Kungsgatan 1")
    assert {r.params.get("sendUpdates") for r in google.writes() if r.method == "POST"} == {"none"}
    assert not any("attendees" in body or "conferenceData" in body for _, body in created)

  @pytest.mark.asyncio
  async def test_skips_events_the_calendar_already_has(
    self, connect: ConnectFixture, save_fixture: SaveFixture, user: User, google: FakeGoogleCalendar
  ) -> None:
    calendars = await _calendars(save_fixture, user)
    await save_fixture(
      CalendarEvent(
        calendar_id=calendars["Företag"].id,
        external_id="x",
        title="Momsdeklaration Q3",
        all_day=True,
        start_date=date(2026, 11, 12),
        end_date=date(2026, 11, 13),
      )
    )
    moms = {"calendar": "Företag", "title": "momsdeklaration q3", "day": "2026-11-12"}
    agi = {"calendar": "Företag", "title": "AGI", "day": "2026-11-12"}

    result = await mcp_call(connect, "add_calendar_events", {"events": [moms, agi, agi]})

    assert [e["title"] for e in result["added"]] == ["AGI"]
    assert [e["title"] for e in result["already_there"]] == ["momsdeklaration q3", "AGI"]
    assert [body["summary"] for _, body in _created(google)] == ["AGI"]

  @pytest.mark.parametrize(
    ("event", "error"),
    [
      ({"calendar": "Jobb", "title": "x", "day": "2026-11-12"}, "No calendar called 'Jobb'. Calendars events can be added to: Företag, Privat."),
      ({"calendar": "Helgdagar i Sverige", "title": "x", "day": "2026-11-12"}, "Events can't be added to 'Helgdagar i Sverige'"),
      ({"calendar": "Privat", "title": "x", "day": "2026-11-12", "start_time": "15:00", "end_time": "14:00"}, "'x': the end must be later"),
      ({"calendar": "Privat", "title": "x", "day": "2026-11-12", "end_time": "14:00"}, "'x': end_time needs a start_time."),
      ({"calendar": "Privat", "title": "x", "day": "2026-11-12", "last_day": "2026-11-11"}, "'x': last_day is before day."),
      ({"calendar": "Privat", "title": "x", "day": "2026-11-12", "start_time": "10:00", "last_day": "2026-11-13"}, "'x': last_day is only for all-day"),
      ({"calendar": "Privat", "title": "x", "day": "2026-11-12", "start_time": "9", "end_time": "10:00"}, "`start_time` must be a local time"),
    ],
  )
  @pytest.mark.asyncio
  async def test_one_bad_event_adds_none_of_them(
    self, connect: ConnectFixture, save_fixture: SaveFixture, user: User, google: FakeGoogleCalendar, event: dict[str, Any], error: str
  ) -> None:
    await _calendars(save_fixture, user)
    fine = {"calendar": "Privat", "title": "Fine", "day": "2026-11-11"}

    message = await mcp_call_error(connect, "add_calendar_events", {"events": [fine, event]})

    assert message.startswith(error), message
    assert google.writes() == []

  @pytest.mark.asyncio
  async def test_another_user_cant_add_to_my_calendars(
    self, connect: ConnectFixture, save_fixture: SaveFixture, user: User, google: FakeGoogleCalendar
  ) -> None:
    await _calendars(save_fixture, user)

    message = await mcp_call_error(connect, "add_calendar_events", {"events": [{"calendar": "Privat", "title": "x", "day": "2026-11-12"}]}, token="token-b")

    assert message == "No calendar called 'Privat'. Calendars events can be added to: none."
    assert google.writes() == []
