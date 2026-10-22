from typing import Any

import pytest
import pytest_asyncio
from api.klarna import endpoints
from api.models.bank_account import BankAccount
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient
from sqlalchemy import select


def item(
  unique_id: str,
  title: str,
  plan: str,
  amount: int,
  *,
  created: str = "2026-05-02T10:00:00.000Z",
  plus: bool = False,
  struck: bool = False,
  avatar: str | None = None,
) -> dict[str, Any]:
  """A purchase as Klarna's app API lists it (fake ids and amounts, real field names)."""
  return {
    "__typename": "TransactionStateV2MasterOutput",
    "uniqueId": unique_id,
    "title": title,
    "createdAt": created,
    "isPending": False,
    "subtitle": [{"text": "12:00", "icon": None}, {"text": plan, "icon": "klarnacard"}],
    "amount": {"currentAmount": amount, "currency": "SEK", "hasPlus": plus, "isAmountLineThrough": struck},
    "avatar": {"avatarType": avatar},
  }


@pytest_asyncio.fixture
async def account(save_fixture: SaveFixture, user: User) -> BankAccount:
  bank_account = BankAccount(name="Klarna Pay later", currency="SEK", base_balance=0, subtype="credit_card", user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


@pytest.fixture
def klarna(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
  items: list[dict[str, Any]] = []

  async def fetch(authorization: str, cookie: str | None) -> list[dict[str, Any]]:
    return [dict(i) for i in items]

  monkeypatch.setattr(endpoints, "fetch_klarna_items", fetch)
  return items


async def _import(client: AsyncClient, account: BankAccount) -> dict[str, Any]:
  response = await client.post("/v1/klarna/import", json={"bank_account_id": str(account.id), "authorization": "Bearer t"})
  assert response.status_code == 200
  return response.json()


async def _stored(session: AsyncSession, account: BankAccount) -> list[tuple[str | None, int, TransactionDirection]]:
  rows = await session.execute(
    select(Transaction.description, Transaction.amount, Transaction.direction)
    .where(Transaction.bank_account_id == account.id)
    .order_by(Transaction.description)
  )
  return [tuple(row) for row in rows]  # type: ignore[misc]


class TestPayLaterImport:
  @pytest.mark.asyncio
  async def test_imports_only_what_is_paid_later(self, client: AsyncClient, session: AsyncSession, account: BankAccount, klarna: list[dict[str, Any]]) -> None:
    klarna.extend(
      [
        item("1", "Vietnam Airlines", "Pay in 30 days", 889861),
        item("2", "Webhallen", "Pay over 6 months", 51400),
        item("3", "Grab", "Pay in full", 4879),
        item("4", "Apotea", "Pay by card", 54900),
        item("5", "Pressbyrån", "Swish", 31700),
        item("6", "Zalando", "Imported from Gmail", 1821),
        item("7", "Ikea", "Delbetala", 99900),
        item("8", "Klarna refund", "Pay in 30 days", 2500, plus=True),
        item("9", "Lime", "Insufficient balance", 2900, struck=True, avatar="REJECTED_CARD"),
        item("10", "Uber", "Frozen card", 18900, struck=True, avatar="REJECTED_CARD"),
      ]
    )

    result = await _import(client, account)

    assert result == {"created": 4, "updated": 0, "paid_at_purchase": 4, "declined": 2, "unrecognized_plans": ["Delbetala"]}
    assert await _stored(session, account) == [
      ("Ikea", 99900, TransactionDirection.debit),
      ("Klarna refund", 2500, TransactionDirection.credit),
      ("Vietnam Airlines", 889861, TransactionDirection.debit),
      ("Webhallen", 51400, TransactionDirection.debit),
    ]

  @pytest.mark.asyncio
  async def test_a_return_after_importing_updates_the_purchase(
    self, client: AsyncClient, session: AsyncSession, account: BankAccount, klarna: list[dict[str, Any]]
  ) -> None:
    klarna.extend([item("1", "Vietnam Airlines", "Pay in 30 days", 889861), item("2", "Maxihost", "Pay in 30 days", 900811)])
    await _import(client, account)

    # Most of the flight came back; Maxihost refunded more than it charged.
    klarna[:] = [item("1", "Vietnam Airlines", "Pay in 30 days", 16007), item("2", "Maxihost", "Pay in 30 days", -5947)]
    result = await _import(client, account)

    assert (result["created"], result["updated"]) == (0, 2)
    assert await _stored(session, account) == [
      ("Maxihost", 5947, TransactionDirection.credit),
      ("Vietnam Airlines", 16007, TransactionDirection.debit),
    ]

  @pytest.mark.asyncio
  async def test_a_purchase_returned_in_full_comes_to_nothing(
    self, client: AsyncClient, session: AsyncSession, account: BankAccount, klarna: list[dict[str, Any]]
  ) -> None:
    klarna.append(item("1", "Zara", "Pay in 30 days", 59900))
    await _import(client, account)
    klarna[:] = [item("1", "Zara", "Pay in 30 days", 0)]

    assert (await _import(client, account))["updated"] == 1
    assert await _stored(session, account) == [("Zara", 0, TransactionDirection.debit)]

  @pytest.mark.asyncio
  async def test_a_purchase_cancelled_after_importing_comes_to_nothing_and_a_new_cancelled_one_is_left_out(
    self, client: AsyncClient, session: AsyncSession, account: BankAccount, klarna: list[dict[str, Any]]
  ) -> None:
    klarna.append(item("1", "Booking.com", "Pay in 30 days", 452300))
    await _import(client, account)
    klarna[:] = [item("1", "Booking.com", "Pay in 30 days", 452300, struck=True), item("2", "Kiwi.com", "Pay in 30 days", 312000, struck=True)]

    result = await _import(client, account)

    assert (result["created"], result["updated"]) == (0, 1)
    assert await _stored(session, account) == [("Booking.com", 0, TransactionDirection.debit)]
