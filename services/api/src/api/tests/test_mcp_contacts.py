from datetime import UTC, datetime

import pytest
from api.common.encryption import encrypt
from api.mcp.tools import TOOLS
from api.models.calendar_account import CalendarAccount, CalendarProvider
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
  bo = Contact(source_id=source.id, resource_name="people/c2", person={}, display_name="Bo Ek", keep_in_touch_days=30, methods=[])
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
    assert detail["addresses"] == [{"label": None, "value": "Storgatan 1, Lund"}]
    assert detail["birthday"] == {"month": 3, "day": 14, "year": 1990}
    assert detail["tags"] == ["Climbing"]

  @pytest.mark.asyncio
  async def test_reminders_list_coming_birthdays_and_who_to_catch_up_with(
    self, connect: ConnectFixture, save_owned: SaveFixture, mocker: MockerFixture
  ) -> None:
    anna, bo = await _contacts(save_owned)
    mocker.patch("api.contacts.keeping.utc_now", return_value=datetime(2027, 3, 10, 12, tzinfo=UTC))

    reminders = await mcp_call(connect, "get_contact_reminders", {"days": 7})

    assert reminders["birthdays"] == [{"contact": {"id": str(anna.id), "display_name": "Anna Berg", "photo_url": None}, "on": "2027-03-14", "turns": 37}]
    assert reminders["catch_up"] == [{"contact": {"id": str(bo.id), "display_name": "Bo Ek", "photo_url": None}, "due_on": "2027-03-10", "last_seen": None}]
    assert await mcp_call(connect, "get_contact_reminders", token="token-b") == {"birthdays": [], "catch_up": []}

  @pytest.mark.asyncio
  async def test_other_user_cannot_find_or_read_contacts(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    anna, _ = await _contacts(save_owned)

    assert (await mcp_call(connect, "find_contacts", token="token-b"))["contacts"] == []
    assert await mcp_call_error(connect, "get_contact", {"contact_id": str(anna.id)}, token="token-b") == "Contact not found."

  def test_contact_tools_only_read(self) -> None:
    tools = {t.fn.__name__: t for t in TOOLS if t.fn.__module__ == "api.mcp.tools.contacts"}

    assert set(tools) == {"find_contacts", "get_contact", "get_contact_reminders"}
    assert all(t.annotations.read_only_hint for t in tools.values())
