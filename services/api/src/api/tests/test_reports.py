from datetime import date
from uuid import uuid4

import pytest
from api.models.bank_account import BankAccount
from api.models.category import Category
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient

DAY = date.today().replace(day=1)


async def _account(save_fixture: SaveFixture, user: User, subtype: str = "checking") -> BankAccount:
  bank_account = BankAccount(name=subtype, currency="SEK", base_balance=0, subtype=subtype, user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


async def _category(save_fixture: SaveFixture, user: User, name: str, *, excluded: bool = False) -> Category:
  category = Category(name=name, slug=name.lower(), color="#22c55e", excluded=excluded, user_id=user.id)
  await save_fixture(category)
  return category


async def _spend(
  save_fixture: SaveFixture,
  bank_account: BankAccount,
  amount: int,
  *,
  category: Category | None = None,
  direction: TransactionDirection = TransactionDirection.debit,
) -> None:
  await save_fixture(
    Transaction(
      amount=amount,
      currency="SEK",
      transaction_date=DAY,
      direction=direction,
      dedup_hash=uuid4().hex,
      bank_account_id=bank_account.id,
      category_id=category.id if category else None,
      user_id=bank_account.user_id,
    )
  )


class TestExcludedFromReports:
  @pytest.mark.asyncio
  async def test_excluded_categories_and_investment_accounts_dont_count_but_uncategorized_does(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User
  ) -> None:
    checking, isk = await _account(save_fixture, user), await _account(save_fixture, user, "isk")
    food, transfer = await _category(save_fixture, user, "Food"), await _category(save_fixture, user, "Transfer", excluded=True)
    await _spend(save_fixture, checking, 100, category=food)
    await _spend(save_fixture, checking, 20)
    await _spend(save_fixture, checking, 5000, category=transfer)
    await _spend(save_fixture, checking, 7000, category=transfer, direction=TransactionDirection.credit)
    await _spend(save_fixture, checking, 3, direction=TransactionDirection.credit)
    await _spend(save_fixture, isk, 900, category=food)

    [current] = [m for m in (await client.get("/v1/transactions/monthly-flow")).json()["items"] if (m["year"], m["month"]) == (DAY.year, DAY.month)]
    spending = (await client.get("/v1/transactions/spending-by-category", params={"year": DAY.year, "month": DAY.month})).json()["items"]

    assert (current["income"], current["expenses"]) == (3, 120)
    assert [(item["category_name"], item["total"]) for item in spending] == [("Food", 100)]
