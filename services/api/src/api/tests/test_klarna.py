from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import pytest
import pytest_asyncio
from api.common.utils import utc_now
from api.klarna import endpoints
from api.klarna.service import KlarnaPayments
from api.models.bank_account import BankAccount
from api.models.klarna import KlarnaPayLater
from api.models.notification import Notification
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.sync_health.service import warn_stale
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
  logo: str | None = None,
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
    "avatar": {"avatarType": avatar, "logoUrl": {"x2": {"url": logo}} if logo else None},
  }


def payment(unique_id: str, title: str, amount: int, paid: str, *, section: str = "completed-subsection-2026-10", logo: str | None = None) -> dict[str, Any]:
  """A completed payment as Klarna's payments page lists it (fake ids and amounts, real field names)."""
  return {
    "icon": {"type": "icon", "value": {"icon": {"type": "remote", "value": {"url": logo}}}} if logo else None,
    "title": {"value": title},
    "subtitle": {"value": "Paid", "state": "success"},
    "metadata": {"unique_id": unique_id, "section_id": section, "calendar_date": paid, "amount": {"amount": str(amount), "currency": "SEK"}},
  }


@dataclass
class FakeKlarna:
  items: list[dict[str, Any]] = field(default_factory=list)
  owed: int = 0
  payments: list[dict[str, Any]] = field(default_factory=list)


@pytest_asyncio.fixture
async def account(save_fixture: SaveFixture, user: User) -> BankAccount:
  bank_account = BankAccount(name="Klarna Pay later", currency="SEK", base_balance=0, subtype="credit_card", user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> FakeKlarna:
  klarna = FakeKlarna()

  async def fetch(authorization: str, cookie: str | None) -> list[dict[str, Any]]:
    return [dict(i) for i in klarna.items]

  async def fetch_payments(authorization: str, cookie: str | None) -> KlarnaPayments:
    return KlarnaPayments(owed=klarna.owed, completed=list(klarna.payments))

  monkeypatch.setattr(endpoints, "fetch_klarna_items", fetch)
  monkeypatch.setattr(endpoints, "fetch_klarna_payments", fetch_payments)
  return klarna


@pytest.fixture
def klarna(fake: FakeKlarna) -> list[dict[str, Any]]:
  return fake.items


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

    assert {k: v for k, v in result.items() if k not in ("payments", "owed", "drift")} == {
      "created": 4,
      "updated": 0,
      "paid_at_purchase": 4,
      "declined": 2,
      "unrecognized_plans": ["Delbetala"],
    }
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


class TestPayLaterPayments:
  @pytest.mark.asyncio
  async def test_payments_come_into_the_account_and_pair_with_where_they_were_paid_from(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, user: User, account: BankAccount, fake: FakeKlarna
  ) -> None:
    balance = BankAccount(name="Klarna", currency="SEK", base_balance=0, subtype="checking", user_id=user.id)
    await save_fixture(balance)
    paid_from_balance = Transaction(
      amount=10900,
      currency="SEK",
      transaction_date=utc_now().date(),
      direction=TransactionDirection.debit,
      dedup_hash="eb:outgoing",
      description="Outgoing transaction",
      bank_account_id=balance.id,
      user_id=user.id,
    )
    await save_fixture(paid_from_balance)
    today = utc_now().date().isoformat()
    fake.items.append(item("1", "Hallon", "Pay in 30 days", 10900))
    fake.payments.extend(
      [
        payment("completed:pay-later:krn:ccs:transaction:1", "Hallon", 10900, today),
        payment("completed:account:4611:P8V1", "Part Pay", 9245, "2023-11-02"),
        payment("completed:pay-now:krn:ccs:transaction:2", "Cloudflare", 4405, today),
        payment("completed:pay-later:krn:ccs:transaction:3", "Klarna Membership", 54900, today, section="completed-subsection-in-progress"),
      ]
    )

    result = await _import(client, account)

    assert (result["created"], result["payments"]) == (1, 2)
    assert await _stored(session, account) == [
      ("Hallon", 10900, TransactionDirection.debit),
      ("Payment for Hallon", 10900, TransactionDirection.credit),
      ("Payment for Part Pay", 9245, TransactionDirection.credit),
    ]
    transfer_ids = dict((await session.execute(select(Transaction.description, Transaction.transfer_id).where(Transaction.amount == 10900))).all())
    assert transfer_ids["Outgoing transaction"] is not None
    assert transfer_ids["Payment for Hallon"] == transfer_ids["Outgoing transaction"]
    assert transfer_ids["Hallon"] is None

  @pytest.mark.asyncio
  async def test_the_account_owes_what_klarna_says_and_a_missed_payment_shows_as_drift(
    self, client: AsyncClient, account: BankAccount, fake: FakeKlarna
  ) -> None:
    fake.items.extend([item("1", "Hallon", "Pay in 30 days", 10900), item("2", "Interflora", "Pay in 30 days", 50800)])
    fake.owed = 10900

    first = await _import(client, account)
    [stored] = (await client.get("/v1/bank-accounts")).json()["items"]
    assert (first["owed"], first["drift"], stored["current_balance"]) == (10900, 0, -10900)

    # Klarna was paid, but the payment isn't in its list.
    fake.owed = 0
    assert (await _import(client, account))["drift"] == 10900
    fake.payments.append(payment("completed:pay-later:krn:ccs:transaction:1", "Hallon", 10900, "2026-10-19"))
    assert (await _import(client, account))["drift"] == 0

  @pytest.mark.asyncio
  async def test_a_card_purchase_is_never_paired_as_a_transfer(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, user: User, account: BankAccount, fake: FakeKlarna
  ) -> None:
    checking = BankAccount(name="Skandia", currency="SEK", base_balance=0, subtype="checking", user_id=user.id)
    await save_fixture(checking)
    await save_fixture(
      Transaction(
        amount=200000,
        currency="SEK",
        transaction_date=utc_now().date(),
        direction=TransactionDirection.credit,
        dedup_hash="salary",
        description="Lön",
        bank_account_id=checking.id,
        user_id=user.id,
      )
    )
    fake.items.append(item("1", "Elgiganten", "Pay in 30 days", 200000, created=utc_now().isoformat()))

    await _import(client, account)

    assert (await session.execute(select(Transaction.id).where(Transaction.transfer_id.is_not(None)))).all() == []


class TestPayLaterReminder:
  @pytest.mark.asyncio
  async def test_reminds_once_when_pay_later_wasnt_imported_for_five_weeks(
    self, session: AsyncSession, save_fixture: SaveFixture, user: User, account: BankAccount
  ) -> None:
    now = utc_now()
    await save_fixture(KlarnaPayLater(user_id=user.id, bank_account_id=account.id, last_imported_at=now - timedelta(days=34)))

    assert await warn_stale(session, now=now) == 0
    assert await warn_stale(session, now=now + timedelta(days=2)) == 1
    assert await warn_stale(session, now=now + timedelta(days=3)) == 0
    await session.flush()
    [reminder] = (await session.execute(select(Notification).where(Notification.user_id == user.id))).scalars().all()
    assert reminder.title == "Import Klarna pay later"

  @pytest.mark.asyncio
  async def test_importing_again_clears_the_reminder(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, user: User, account: BankAccount, fake: FakeKlarna
  ) -> None:
    long_ago = utc_now() - timedelta(days=40)
    await save_fixture(KlarnaPayLater(user_id=user.id, bank_account_id=account.id, last_imported_at=long_ago, stale_notified_at=long_ago))

    await _import(client, account)

    state = (await session.execute(select(KlarnaPayLater).where(KlarnaPayLater.bank_account_id == account.id))).scalar_one()
    assert state.stale_notified_at is None and state.last_imported_at is not None and state.last_imported_at > long_ago
    assert await warn_stale(session, now=utc_now()) == 0


MERCHANT_LOGO = "https://assets.klarnacdn.net/rs:fit:100:100:1:1/bg:255:255:255/image/6a271667/8e39"


class TestMerchantLogos:
  @pytest.mark.asyncio
  async def test_a_purchase_and_its_payment_keep_the_merchants_logo_but_never_klarnas_own_icons(
    self, client: AsyncClient, session: AsyncSession, account: BankAccount, fake: FakeKlarna
  ) -> None:
    fake.items.extend(
      [
        item("1", "Hallon", "Pay in 30 days", 10900, logo=MERCHANT_LOGO),
        item("2", "Adidas", "Pay in 30 days", 59900, avatar="KLARNA_CARD", logo="https://x.klarnacdn.net/klapp/assets/you-card/icon-round-klarna-card-100.png"),
        item("3", "Webhallen", "Pay in 30 days", 51400, logo="https://example.com/image/logo.png"),
        item("4", "Ikea", "Pay in 30 days", 99900),
        item("5", "Elgiganten", "Pay in 30 days", 29900, logo="https://assets.klarnacdn.net/klapp/assets/placeholder.png"),
      ]
    )
    fake.payments.append(payment("completed:pay-later:krn:1", "Hallon", 10900, "2026-10-19", logo=MERCHANT_LOGO))

    await _import(client, account)

    rows = await session.execute(select(Transaction.description, Transaction.logo_url).where(Transaction.bank_account_id == account.id))
    assert dict(rows.all()) == {
      "Hallon": MERCHANT_LOGO,
      "Payment for Hallon": MERCHANT_LOGO,
      "Adidas": None,
      "Webhallen": None,
      "Ikea": None,
      "Elgiganten": None,
    }
    listed = (await client.get("/v1/transactions", params={"bank_account_id": str(account.id), "limit": 10})).json()["items"]
    assert {t["description"]: t["logo_url"] for t in listed}["Hallon"] == MERCHANT_LOGO
