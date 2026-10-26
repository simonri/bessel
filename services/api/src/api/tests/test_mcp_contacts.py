from datetime import UTC, datetime

import httpx
import pytest
from api.calendars import http as provider_http
from api.common.encryption import encrypt
from api.mcp.tools import TOOLS
from api.models.calendar import Calendar
from api.models.calendar_account import CalendarAccount, CalendarProvider
from api.models.calendar_event import CalendarEvent
from api.models.contact import Contact, ContactMethod, ContactMethodKind, ContactSource
from api.settings import settings
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error
from cryptography.fernet import Fernet
from pytest_mock import MockerFixture


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())


async def _contacts(save_owned: SaveFixture) -> tuple[Contact, Contact]:
  account = CalendarAccount(provider=CalendarProvider.google, email="me@gmail.com", encrypted_credentials=encrypt("r"), can_read_people=True)
  await save_owned(account)
  source = ContactSource(account_id=account.id)
  await save_owned(source)
  anna = Contact(
    source_id=source.id,
    resource_name="people/c1",
    person={},
    display_name="Anna Berg",
    organization="Acme",
    birthday_month=3,
    birthday_day=14,
    birthday_year=1990,
    tags=["Climbing"],
    methods=[
      ContactMethod(kind=ContactMethodKind.phone, label="Mobile", value="+46 70 123 45 67", position=0),
      ContactMethod(kind=ContactMethodKind.email, value="anna@example.com", position=1),
      ContactMethod(kind=ContactMethodKind.address, value="Storgatan 1, Lund", position=2),
    ],
  )
  bo = Contact(source_id=source.id, resource_name="people/c2", person={}, display_name="Bo Ek", methods=[])
  await save_owned(anna)
  await save_owned(bo)
  return anna, bo


class TestContacts:
  @pytest.mark.asyncio
  async def test_find_by_name_or_number_then_get_the_details(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    anna, _ = await _contacts(save_owned)

    everyone = await mcp_call(connect, "find_contacts")
    by_number = await mcp_call(connect, "find_contacts", {"search": "123 45"})
    by_tag = await mcp_call(connect, "find_contacts", {"search": "climb"})
    detail = await mcp_call(connect, "get_contact", {"contact_id": str(anna.id)})

    assert [c["name"] for c in everyone["contacts"]] == ["Anna Berg", "Bo Ek"]
    assert by_number == {
      "total_count": 1,
      "contacts": [
        {"id": str(anna.id), "name": "Anna Berg", "organization": "Acme", "phones": ["+46 70 123 45 67"], "emails": ["anna@example.com"], "tags": ["Climbing"]}
      ],
    }
    assert [c["name"] for c in by_tag["contacts"]] == ["Anna Berg"]
    assert detail["contact"]["addresses"] == [{"label": None, "value": "Storgatan 1, Lund", "display": "Storgatan 1, Lund"}]
    assert detail["contact"]["birthday"] == {"month": 3, "day": 14, "year": 1990}
    assert detail["contact"]["tags"] == ["Climbing"]
    assert detail["recent"] == []

  @pytest.mark.asyncio
  async def test_reminders_list_coming_birthdays(self, connect: ConnectFixture, save_owned: SaveFixture, mocker: MockerFixture) -> None:
    anna, _ = await _contacts(save_owned)
    mocker.patch("api.contacts.keeping.utc_now", return_value=datetime(2027, 3, 10, 12, tzinfo=UTC))

    reminders = await mcp_call(connect, "get_contact_reminders", {"days": 7})

    assert reminders == {
      "dates": [{"contact": {"id": str(anna.id), "display_name": "Anna Berg", "photo_url": None}, "label": "Birthday", "on": "2027-03-14", "years": 37}]
    }
    assert await mcp_call(connect, "get_contact_reminders", token="token-b") == {"dates": []}

  @pytest.mark.asyncio
  async def test_logging_adds_to_bessels_log_without_touching_google(
    self, connect: ConnectFixture, save_owned: SaveFixture, mocker: MockerFixture, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    anna, _ = await _contacts(save_owned)
    mocker.patch("api.contacts.keeping.utc_now", return_value=datetime(2027, 3, 10, 12, tzinfo=UTC))
    monkeypatch.setattr(provider_http, "client", lambda: httpx.AsyncClient(transport=httpx.MockTransport(_no_google)))

    logged = await mcp_call(connect, "log_interaction", {"contact_id": str(anna.id), "note": "Moving to Berlin", "kind": "call"})
    detail = await mcp_call(connect, "get_contact", {"contact_id": str(anna.id)})

    assert (logged["occurred_on"], logged["kind"], logged["source"], logged["note"]) == ("2027-03-10", "call", "assistant", "Moving to Berlin")
    assert [(e["kind"], e["note"]) for e in detail["recent"]] == [("call", "Moving to Berlin")]
    assert detail["contact"]["last_seen"] == {"on": "2027-03-10", "kind": "call", "summary": "Moving to Berlin"}
    assert await mcp_call_error(connect, "log_interaction", {"contact_id": str(anna.id)}, token="token-b") == "Contact not found."

  @pytest.mark.asyncio
  async def test_a_meeting_brief_names_who_is_coming(self, connect: ConnectFixture, save_owned: SaveFixture, mocker: MockerFixture) -> None:
    anna, _ = await _contacts(save_owned)
    mocker.patch("api.contacts.keeping.utc_now", return_value=datetime(2027, 3, 10, 12, tzinfo=UTC))
    account = CalendarAccount(provider=CalendarProvider.google, email="work@gmail.com", encrypted_credentials=encrypt("r"))
    await save_owned(account)
    calendar = Calendar(account_id=account.id, external_id="work", name="Work", color="#000000")
    await save_owned(calendar)
    start = datetime(2027, 3, 11, 9, tzinfo=UTC)
    meeting = CalendarEvent(
      calendar_id=calendar.id, external_id="m1", title="Planning", all_day=False, start_at=start, end_at=start, attendees=[{"email": "anna@example.com"}]
    )
    await save_owned(meeting)

    brief = await mcp_call(connect, "get_meeting_brief", {"calendar_event_id": str(meeting.id)})

    assert [(p["contact"]["display_name"], p["sure"]) for p in brief["people"]] == [("Anna Berg", True)]
    assert await mcp_call_error(connect, "get_meeting_brief", {"calendar_event_id": str(meeting.id)}, token="token-b") == "Event not found"

  @pytest.mark.asyncio
  async def test_other_user_cannot_find_or_read_contacts(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    anna, _ = await _contacts(save_owned)

    assert (await mcp_call(connect, "find_contacts", token="token-b"))["contacts"] == []
    assert await mcp_call_error(connect, "get_contact", {"contact_id": str(anna.id)}, token="token-b") == "Contact not found."

  def test_only_the_log_is_written_and_nothing_deleted(self) -> None:
    tools = {t.fn.__name__: t for t in TOOLS if t.fn.__module__ == "api.mcp.tools.contacts"}

    assert set(tools) == {"find_contacts", "get_contact", "get_contact_reminders", "get_meeting_brief", "log_interaction"}
    assert [name for name, t in tools.items() if not t.annotations.read_only_hint] == ["log_interaction"]
    assert not any(t.annotations.destructive_hint for t in tools.values())


def _no_google(request: httpx.Request) -> httpx.Response:
  raise AssertionError(f"Logging must not reach Google: {request.url}")
