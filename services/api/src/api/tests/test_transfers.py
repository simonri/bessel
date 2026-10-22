import json
from datetime import date, timedelta

import pytest
from api.models.bank_account import BankAccount
from api.models.category import Category
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.tests.fixtures.database import SaveFixture
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.service import transaction_service
from api.transactions.transfers import match_transfers
from httpx import AsyncClient
from sqlalchemy import select

DAY = date.today().replace(day=1) + timedelta(days=5)
_counter = iter(range(10_000))


async def _account(save_fixture: SaveFixture, user: User, name: str) -> BankAccount:
  bank_account = BankAccount(name=name, currency="SEK", base_balance=0, subtype="checking", user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


async def _import(
  session: AsyncSession,
  bank_account: BankAccount,
  amount: int,
  direction: TransactionDirection,
  day: date = DAY,
  *,
  currency: str = "SEK",
) -> None:
  parsed = ParsedTransaction(
    transaction_date=day,
    amount_minor=amount,
    currency=currency,
    direction=direction,
    dedup_hash=f"test:{next(_counter)}",
    description="Överföring",
    raw_data={},
  )
  await transaction_service.import_transactions(
    session,
    bank_account_id=bank_account.id,
    bank_name="test",
    file_format="api",
    raw_content=json.dumps([]),
    parsed=[parsed],
    user_id=bank_account.user_id,
  )


async def _flow(client: AsyncClient) -> tuple[int, int]:
  [current] = [m for m in (await client.get("/v1/transactions/monthly-flow")).json()["items"] if (m["year"], m["month"]) == (DAY.year, DAY.month)]
  return current["income"], current["expenses"]


class TestPairing:
  @pytest.mark.asyncio
  async def test_a_move_between_own_accounts_counts_as_neither_income_nor_spending(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, user: User
  ) -> None:
    skandia, klarna = await _account(save_fixture, user, "Skandia"), await _account(save_fixture, user, "Klarna")
    await _import(session, skandia, 4500, TransactionDirection.debit)
    await _import(session, skandia, 200000, TransactionDirection.debit)
    # Booked two days later; importing it alone must still find the earlier side.
    await _import(session, klarna, 200000, TransactionDirection.credit, DAY + timedelta(days=2))

    paired = (await session.execute(select(Transaction.amount, Transaction.transfer_id).where(Transaction.transfer_id.is_not(None)))).all()
    assert sorted(amount for amount, _ in paired) == [200000, 200000]
    assert len({transfer_id for _, transfer_id in paired}) == 1
    assert await _flow(client) == (0, 4500)
    listed = (await client.get("/v1/transactions", params={"limit": 50})).json()["items"]
    assert len({t["transfer_id"] for t in listed if t["amount"] == 200000}) == 1

  @pytest.mark.asyncio
  async def test_only_clear_single_matches_across_accounts_are_paired(self, session: AsyncSession, save_fixture: SaveFixture, user: User) -> None:
    a, b, c = [await _account(save_fixture, user, name) for name in ("A", "B", "C")]
    # Two equal debits against one credit, or one debit against two credits, can't be told apart.
    await _import(session, a, 1000, TransactionDirection.debit)
    await _import(session, c, 1000, TransactionDirection.debit)
    await _import(session, b, 1000, TransactionDirection.credit)
    for bank_account, direction in ((a, TransactionDirection.debit), (b, TransactionDirection.credit), (c, TransactionDirection.credit)):
      await save_fixture(
        Transaction(
          amount=6000,
          currency="SEK",
          transaction_date=DAY,
          direction=direction,
          dedup_hash=f"six-{bank_account.name}",
          bank_account_id=bank_account.id,
          user_id=user.id,
        )
      )
    await match_transfers(session, user.id)
    # Same account, too far apart, or another currency are not transfers.
    await _import(session, a, 2000, TransactionDirection.debit)
    await _import(session, a, 2000, TransactionDirection.credit)
    await _import(session, a, 3000, TransactionDirection.debit)
    await _import(session, b, 3000, TransactionDirection.credit, DAY + timedelta(days=3))
    await _import(session, a, 4000, TransactionDirection.debit)
    await _import(session, b, 4000, TransactionDirection.credit, currency="EUR")
    await _import(session, a, 5000, TransactionDirection.debit, currency="EUR")
    await _import(session, b, 5000, TransactionDirection.credit)

    assert (await session.execute(select(Transaction.id).where(Transaction.transfer_id.is_not(None)))).all() == []

  @pytest.mark.asyncio
  async def test_a_categorized_transaction_is_left_alone(self, session: AsyncSession, save_fixture: SaveFixture, user: User) -> None:
    a, b = await _account(save_fixture, user, "A"), await _account(save_fixture, user, "B")
    category = Category(name="Rent", slug="rent", color="#22c55e", user_id=user.id)
    await save_fixture(category)
    await save_fixture(
      Transaction(
        amount=9000,
        currency="SEK",
        transaction_date=DAY,
        direction=TransactionDirection.debit,
        dedup_hash="rent",
        bank_account_id=a.id,
        category_id=category.id,
        user_id=user.id,
      )
    )
    await _import(session, b, 9000, TransactionDirection.credit)

    assert (await session.execute(select(Transaction.id).where(Transaction.transfer_id.is_not(None)))).all() == []

  @pytest.mark.asyncio
  async def test_history_can_be_paired_after_the_fact(self, session: AsyncSession, save_fixture: SaveFixture, user: User) -> None:
    a, b = await _account(save_fixture, user, "A"), await _account(save_fixture, user, "B")
    for bank_account, direction in ((a, TransactionDirection.debit), (b, TransactionDirection.credit)):
      await save_fixture(
        Transaction(
          amount=777, currency="SEK", transaction_date=DAY, direction=direction, dedup_hash=f"old-{direction}", bank_account_id=bank_account.id, user_id=user.id
        )
      )

    assert await match_transfers(session, user.id) == 1
    assert await match_transfers(session, user.id) == 0


class TestUnpairing:
  @pytest.mark.asyncio
  async def test_unpairing_counts_both_sides_again_and_never_pairs_them_again(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, user: User
  ) -> None:
    a, b = await _account(save_fixture, user, "A"), await _account(save_fixture, user, "B")
    await _import(session, a, 5000, TransactionDirection.debit)
    await _import(session, b, 5000, TransactionDirection.credit)
    debit = (await session.execute(select(Transaction).where(Transaction.direction == TransactionDirection.debit))).scalar_one()
    assert debit.transfer_id is not None

    assert (await client.delete(f"/v1/transactions/{debit.id}/transfer")).status_code == 204
    assert await match_transfers(session, user.id) == 0

    assert await _flow(client) == (5000, 5000)
    assert (await client.delete(f"/v1/transactions/{debit.id}/transfer")).status_code == 400
