from datetime import date
from uuid import uuid4

import pytest
from api.models.bank_account import BankAccount
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient


async def _account(save_fixture: SaveFixture, user: User, name: str, *, business: bool) -> BankAccount:
  bank_account = BankAccount(name=name, currency="SEK", base_balance=0, subtype="checking", is_business=business, user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


async def _transaction(save_fixture: SaveFixture, account: BankAccount, description: str, *, is_business: bool = False) -> Transaction:
  transaction = Transaction(
    amount=10_000,
    currency="SEK",
    transaction_date=date(2026, 10, 1),
    direction=TransactionDirection.debit,
    dedup_hash=uuid4().hex,
    description=description,
    bank_account_id=account.id,
    user_id=account.user_id,
    is_business=is_business,
  )
  await save_fixture(transaction)
  return transaction


class TestCompanyAccountTransactions:
  @pytest.mark.asyncio
  async def test_the_company_filter_takes_in_the_company_accounts_and_costs_marked_by_hand(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User
  ) -> None:
    company, personal = await _account(save_fixture, user, "Marginalen", business=True), await _account(save_fixture, user, "Skandia", business=False)
    await _transaction(save_fixture, company, "Hetzner")
    await _transaction(save_fixture, personal, "Cloudflare", is_business=True)
    await _transaction(save_fixture, personal, "ICA")

    def described(response: dict) -> list[str]:
      return sorted(t["description"] for t in response["items"])

    company_money = (await client.get("/v1/transactions", params={"is_business": "true"})).json()
    own_money = (await client.get("/v1/transactions", params={"is_business": "false"})).json()

    assert described(company_money) == ["Cloudflare", "Hetzner"]
    assert described(own_money) == ["ICA"]

  @pytest.mark.asyncio
  async def test_each_transaction_says_whether_it_is_on_a_company_account(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    company, personal = await _account(save_fixture, user, "Marginalen", business=True), await _account(save_fixture, user, "Skandia", business=False)
    hetzner = await _transaction(save_fixture, company, "Hetzner")
    await _transaction(save_fixture, personal, "Cloudflare", is_business=True)

    listed = {t["description"]: (t["company_account"], t["is_business"]) for t in (await client.get("/v1/transactions")).json()["items"]}
    updated = (await client.patch(f"/v1/transactions/{hetzner.id}", json={"note": "Server"})).json()

    assert listed == {"Hetzner": (True, False), "Cloudflare": (False, True)}
    assert (updated["company_account"], updated["is_business"]) == (True, False)
