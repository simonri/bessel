from datetime import date
from uuid import uuid4

import pytest
from api.models.bank_account import BankAccount
from api.models.category import Category
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient

DEBIT, CREDIT = TransactionDirection.debit, TransactionDirection.credit


class _Ledger:
  def __init__(self, save_fixture: SaveFixture, user: User) -> None:
    self.save_fixture, self.user = save_fixture, user

  async def account(self, name: str, *, subtype: str = "checking", currency: str = "SEK", business: bool = False) -> BankAccount:
    account = BankAccount(name=name, currency=currency, base_balance=0, subtype=subtype, is_business=business, user_id=self.user.id)
    await self.save_fixture(account)
    return account

  async def category(self, name: str, *, excluded: bool = False, income: bool = False) -> Category:
    category = Category(name=name, slug=name.lower(), color="#22c55e", excluded=excluded, income=income, user_id=self.user.id)
    await self.save_fixture(category)
    return category

  async def add(
    self,
    account: BankAccount,
    day: date,
    amount: int,
    direction: TransactionDirection,
    description: str,
    *,
    category: Category | None = None,
    transfer: bool = False,
  ) -> None:
    await self.save_fixture(
      Transaction(
        amount=amount,
        currency=account.currency,
        transaction_date=day,
        direction=direction,
        dedup_hash=uuid4().hex,
        description=description,
        bank_account_id=account.id,
        category_id=category.id if category else None,
        transfer_id=uuid4() if transfer else None,
        user_id=account.user_id,
      )
    )


@pytest.fixture
def ledger(save_fixture: SaveFixture, user: User) -> _Ledger:
  return _Ledger(save_fixture, user)


async def _summary(client: AsyncClient, year: int = 2026, month: int = 9) -> dict:
  response = await client.get("/v1/transactions/summary", params={"year": year, "month": month})
  assert response.status_code == 200
  return response.json()


class TestMonthSummary:
  @pytest.mark.asyncio
  async def test_counts_only_the_users_own_income_and_spending(self, client: AsyncClient, ledger: _Ledger) -> None:
    checking = await ledger.account("Skandia")
    company = await ledger.account("Marginalen", business=True)
    isk = await ledger.account("Avanza", subtype="isk")
    food, moved = await ledger.category("Food"), await ledger.category("Internal transfer", excluded=True)
    day = date(2026, 9, 10)
    await ledger.add(checking, day, 3000000, CREDIT, "Lön")
    await ledger.add(checking, day, 50000, DEBIT, "ICA Kvantum", category=food)
    await ledger.add(checking, date(2026, 9, 12), 40000, DEBIT, "ICA Kvantum", category=food)
    # Money back for a purchase lowers spending instead of counting as income.
    await ledger.add(checking, date(2026, 9, 14), 10000, CREDIT, "ICA Kvantum", category=food)
    await ledger.add(checking, day, 10900, DEBIT, "Hallon")
    # The same text charged in another account doesn't make this one a refund.
    savings = await ledger.account("Sparkonto")
    await ledger.add(savings, day, 30000, DEBIT, "Överföring 9159")
    await ledger.add(checking, day, 30000, CREDIT, "Överföring 9159")
    await ledger.add(checking, day, 2000000, DEBIT, "Överföring", transfer=True)
    await ledger.add(checking, day, 700000, DEBIT, "Swish till Klarna", category=moved)
    await ledger.add(company, day, 999900, DEBIT, "Server rent")
    await ledger.add(isk, day, 123400, DEBIT, "Köp fond")

    summary = await _summary(client)

    [sek] = summary["currencies"]
    assert (sek["income"], sek["spending"], sek["net"]) == (3030000, 120900, 2909100)
    assert [(c["name"], c["total"], c["count"]) for c in sek["categories"]] == [("Food", 80000, 3), ("Uncategorized", 40900, 2)]
    assert sek["categories"][1]["category_id"] is None
    assert [(m["description"], m["total"]) for m in sek["merchants"]] == [("ICA Kvantum", 80000), ("Överföring 9159", 30000), ("Hallon", 10900)]
    assert (summary["uncategorized"], summary["transfers"]) == (4, 1)

  @pytest.mark.asyncio
  async def test_a_friend_paying_back_lowers_spending_where_its_filed_and_earned_money_stays_income(
    self, client: AsyncClient, ledger: _Ledger
  ) -> None:
    checking = await ledger.account("Skandia")
    dinner, other_income = await ledger.category("Restaurang"), await ledger.category("Övriga inkomster", income=True)
    day = date(2026, 9, 10)
    await ledger.add(checking, day, 60000, DEBIT, "Restaurang Prinsen", category=dinner)
    await ledger.add(checking, day, 30000, CREDIT, "Swish från Anna", category=dinner)
    await ledger.add(checking, day, 50000, CREDIT, "Swish från Blocket-köpare", category=other_income)
    await ledger.add(checking, day, 20000, CREDIT, "Swish från Erik")

    [sek] = (await _summary(client))["currencies"]

    assert (sek["income"], sek["spending"]) == (70000, 30000)
    assert [(c["name"], c["total"]) for c in sek["categories"]] == [("Restaurang", 30000)]

  @pytest.mark.asyncio
  async def test_compares_with_the_month_before_and_the_six_before_that(self, client: AsyncClient, ledger: _Ledger) -> None:
    checking = await ledger.account("Skandia")
    for month, spent in ((3, 70000), (8, 50000), (9, 20000)):
      await ledger.add(checking, date(2026, month, 5), spent, DEBIT, "Rent")
      await ledger.add(checking, date(2026, month, 25), 600000, CREDIT, "Lön")
    await ledger.add(checking, date(2025, 9, 30), 999900, DEBIT, "A year ago")

    [sek] = (await _summary(client))["currencies"]

    assert (sek["previous"]["month"], sek["previous"]["spending"]) == (8, 50000)
    # March to August: 70,000 and 50,000 over six months.
    assert (sek["average_spending"], sek["average_income"]) == (20000, 200000)
    assert [(m["month"], m["spending"]) for m in sek["months"]][:1] == [(10, 0)]
    assert len(sek["months"]) == 12 and sek["months"][-1]["month"] == 9

  @pytest.mark.asyncio
  async def test_currencies_are_never_added_together(self, client: AsyncClient, ledger: _Ledger) -> None:
    sek, eur = await ledger.account("Skandia"), await ledger.account("Revolut EUR", currency="EUR")
    await ledger.add(sek, date(2026, 9, 3), 30000, DEBIT, "ICA")
    await ledger.add(eur, date(2026, 9, 3), 90000, DEBIT, "Grab")

    summary = await _summary(client)

    assert [(c["currency"], c["spending"]) for c in summary["currencies"]] == [("EUR", 90000), ("SEK", 30000)]

  @pytest.mark.asyncio
  async def test_another_users_money_is_not_in_it(self, other_client: AsyncClient, ledger: _Ledger) -> None:
    checking = await ledger.account("Skandia")
    await ledger.add(checking, date(2026, 9, 3), 30000, DEBIT, "ICA")

    assert (await _summary(other_client))["currencies"] == []


class TestTransferFilter:
  @pytest.mark.asyncio
  async def test_lists_only_transfers_or_leaves_them_out(self, client: AsyncClient, ledger: _Ledger) -> None:
    checking = await ledger.account("Skandia")
    await ledger.add(checking, date(2026, 9, 3), 30000, DEBIT, "ICA")
    await ledger.add(checking, date(2026, 9, 3), 50000, DEBIT, "Överföring", transfer=True)

    only = (await client.get("/v1/transactions", params={"transfers": True})).json()["items"]
    without = (await client.get("/v1/transactions", params={"transfers": False})).json()["items"]

    assert ([t["description"] for t in only], [t["description"] for t in without]) == (["Överföring"], ["ICA"])
