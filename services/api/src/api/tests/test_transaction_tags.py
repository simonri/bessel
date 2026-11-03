from datetime import date
from typing import Any
from uuid import uuid4

import pytest
from api.models.bank_account import BankAccount
from api.models.category import Category
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.tests.fixtures.database import SaveFixture
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.service import transaction_service
from httpx import AsyncClient

DEBIT, CREDIT = TransactionDirection.debit, TransactionDirection.credit


async def _account(save_fixture: SaveFixture, user: User, name: str = "Checking", **fields: Any) -> BankAccount:
  account = BankAccount(name=name, currency="SEK", base_balance=0, user_id=user.id, **{"subtype": "checking", **fields})
  await save_fixture(account)
  return account


async def _transaction(
  save_fixture: SaveFixture,
  account: BankAccount,
  description: str,
  *,
  amount: int = 10_000,
  direction: TransactionDirection = DEBIT,
  day: date = date(2026, 10, 1),
  currency: str = "SEK",
  **fields: Any,
) -> Transaction:
  transaction = Transaction(
    amount=amount,
    currency=currency,
    transaction_date=day,
    direction=direction,
    dedup_hash=uuid4().hex,
    description=description,
    bank_account_id=account.id,
    user_id=account.user_id,
    **fields,
  )
  await save_fixture(transaction)
  return transaction


async def _listed(client: AsyncClient, **params: Any) -> list[str]:
  return sorted(t["description"] for t in (await client.get("/v1/transactions", params=params)).json()["items"])


class TestTagging:
  @pytest.mark.asyncio
  async def test_tags_replace_and_take_the_spelling_the_user_already_has(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    account = await _account(save_fixture, user)
    await _transaction(save_fixture, account, "Hotel", tags=["Lisbon 2026"])
    taxi = await _transaction(save_fixture, account, "Taxi", tags=["old"])

    updated = await client.patch(f"/v1/transactions/{taxi.id}", json={"tags": ["  lisbon   2026 ", "Ask the accountant", "ask THE accountant"]})

    assert updated.status_code == 200
    assert updated.json()["tags"] == ["Lisbon 2026", "Ask the accountant"]

  @pytest.mark.asyncio
  async def test_other_changes_leave_the_tags_alone(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    taxi = await _transaction(save_fixture, await _account(save_fixture, user), "Taxi", tags=["Trip"])

    updated = await client.patch(f"/v1/transactions/{taxi.id}", json={"note": "Airport"})

    assert updated.json()["tags"] == ["Trip"]

  @pytest.mark.asyncio
  async def test_a_tag_is_at_most_fifty_characters_and_a_transaction_has_at_most_twenty(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User
  ) -> None:
    taxi = await _transaction(save_fixture, await _account(save_fixture, user), "Taxi")

    too_long = await client.patch(f"/v1/transactions/{taxi.id}", json={"tags": ["x" * 51]})
    too_many = await client.patch(f"/v1/transactions/{taxi.id}", json={"tags": [f"t{i}" for i in range(21)]})
    blank = await client.patch(f"/v1/transactions/{taxi.id}", json={"tags": ["  "]})

    assert (too_long.status_code, too_many.status_code, blank.status_code) == (422, 422, 422)

  @pytest.mark.asyncio
  async def test_bulk_adds_and_removes_on_the_given_ones_only_and_keeps_their_category(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User
  ) -> None:
    account = await _account(save_fixture, user)
    food = Category(name="Mat", slug="mat", user_id=user.id)
    await save_fixture(food)
    hotel = await _transaction(save_fixture, account, "Hotel", tags=["Work", "Lisbon"], category_id=food.id)
    taxi = await _transaction(save_fixture, account, "Taxi")
    await _transaction(save_fixture, account, "Groceries", tags=["Work"])

    body = {"ids": [str(hotel.id), str(taxi.id)], "add": ["lisbon", "Receipts"], "remove": ["work"]}
    response = await client.post("/v1/transactions/tags", json=body)

    tagged = {t["description"]: (t["tags"], t["category_id"]) for t in (await client.get("/v1/transactions")).json()["items"]}
    assert response.json() == {"updated": 2}
    assert tagged == {
      "Hotel": (["Lisbon", "Receipts"], str(food.id)),
      "Taxi": (["Lisbon", "Receipts"], None),
      "Groceries": (["Work"], None),
    }

  @pytest.mark.asyncio
  async def test_bulk_counts_only_the_ones_it_changed(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    account = await _account(save_fixture, user)
    hotel = await _transaction(save_fixture, account, "Hotel", tags=["Trip"])
    taxi = await _transaction(save_fixture, account, "Taxi")

    response = await client.post("/v1/transactions/tags", json={"ids": [str(hotel.id), str(taxi.id)], "add": ["Trip"]})

    assert response.json() == {"updated": 1}

  @pytest.mark.asyncio
  async def test_bulk_refuses_to_go_over_twenty_tags(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    hotel = await _transaction(save_fixture, await _account(save_fixture, user), "Hotel", tags=[f"t{i}" for i in range(20)])

    response = await client.post("/v1/transactions/tags", json={"ids": [str(hotel.id)], "add": ["one more"]})

    assert response.status_code == 422
    assert "at most 20 tags" in response.json()["detail"]

  @pytest.mark.asyncio
  async def test_the_list_filters_by_any_of_the_tags(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    account = await _account(save_fixture, user)
    await _transaction(save_fixture, account, "Hotel", tags=["Lisbon"])
    await _transaction(save_fixture, account, "Laptop", tags=["Work"])
    await _transaction(save_fixture, account, "Groceries")

    assert await _listed(client, tag="Lisbon") == ["Hotel"]
    assert await _listed(client, tag=["Lisbon", "Work"]) == ["Hotel", "Laptop"]
    assert await _listed(client) == ["Groceries", "Hotel", "Laptop"]


class TestTagSummaries:
  @pytest.mark.asyncio
  async def test_each_tag_with_money_out_and_in_per_currency_most_used_first(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    account = await _account(save_fixture, user)
    await _transaction(save_fixture, account, "Hotel", amount=150_000, tags=["Lisbon"])
    await _transaction(save_fixture, account, "Dinner", amount=40_000, currency="EUR", tags=["Lisbon", "Friends"])
    await _transaction(save_fixture, account, "Share back", amount=15_000, currency="EUR", direction=CREDIT, tags=["Lisbon"])
    await _transaction(save_fixture, account, "Untagged", amount=99_900)

    items = (await client.get("/v1/transactions/tags")).json()["items"]

    assert items == [
      {
        "tag": "Lisbon",
        "count": 3,
        "totals": [{"currency": "SEK", "spent": 150_000, "received": 0}, {"currency": "EUR", "spent": 40_000, "received": 15_000}],
      },
      {"tag": "Friends", "count": 1, "totals": [{"currency": "EUR", "spent": 40_000, "received": 0}]},
    ]

  @pytest.mark.asyncio
  async def test_only_the_period_and_never_moves_between_own_accounts(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    account = await _account(save_fixture, user)
    await _transaction(save_fixture, account, "Hotel", amount=150_000, day=date(2026, 10, 3), tags=["Trip"])
    await _transaction(save_fixture, account, "Flights", amount=300_000, day=date(2026, 9, 20), tags=["Trip"])
    await _transaction(save_fixture, account, "Souvenirs", amount=20_000, day=date(2026, 11, 1), tags=["Trip"])
    await _transaction(save_fixture, account, "To savings", amount=500_000, day=date(2026, 10, 4), transfer_id=uuid4(), tags=["Trip"])

    october = (await client.get("/v1/transactions/tags", params={"date_from": "2026-10-01", "date_to": "2026-10-31"})).json()["items"]

    assert october == [{"tag": "Trip", "count": 1, "totals": [{"currency": "SEK", "spent": 150_000, "received": 0}]}]

  @pytest.mark.asyncio
  async def test_company_money_can_be_kept_apart(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    own, company = await _account(save_fixture, user, "Own"), await _account(save_fixture, user, "AB", is_business=True)
    await _transaction(save_fixture, own, "Hotel", amount=150_000, tags=["Trip"])
    await _transaction(save_fixture, own, "Client dinner", amount=60_000, tags=["Trip"], is_business=True)
    await _transaction(save_fixture, company, "Conference", amount=200_000, tags=["Trip"])

    def spent(response: Any) -> int:
      [summary] = response.json()["items"]
      return summary["totals"][0]["spent"]

    assert spent(await client.get("/v1/transactions/tags")) == 410_000
    assert spent(await client.get("/v1/transactions/tags", params={"is_business": "false"})) == 150_000
    assert spent(await client.get("/v1/transactions/tags", params={"is_business": "true"})) == 260_000

  @pytest.mark.asyncio
  async def test_another_users_tags_and_spellings_are_their_own(
    self, client: AsyncClient, other_client: AsyncClient, save_fixture: SaveFixture, user: User, other_user: User
  ) -> None:
    await _transaction(save_fixture, await _account(save_fixture, user), "Hotel", tags=["Lisbon"])
    theirs = await _transaction(save_fixture, await _account(save_fixture, other_user), "Hostel")

    await other_client.patch(f"/v1/transactions/{theirs.id}", json={"tags": ["LISBON"]})

    assert [t["tag"] for t in (await other_client.get("/v1/transactions/tags")).json()["items"]] == ["LISBON"]
    assert [t["tag"] for t in (await client.get("/v1/transactions/tags")).json()["items"]] == ["Lisbon"]

  @pytest.mark.asyncio
  async def test_names_list_every_tag_even_one_only_on_a_transfer_or_outside_the_period(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User
  ) -> None:
    account = await _account(save_fixture, user)
    await _transaction(save_fixture, account, "Hotel", day=date(2026, 10, 3), tags=["Trip"])
    await _transaction(save_fixture, account, "Taxi", day=date(2026, 10, 4), tags=["Trip"])
    await _transaction(save_fixture, account, "To savings", day=date(2026, 10, 4), transfer_id=uuid4(), tags=["Savings goal"])
    await _transaction(save_fixture, account, "Laptop", day=date(2025, 3, 1), tags=["Work"])

    tags = (await client.get("/v1/transactions/tags", params={"date_from": "2026-10-01", "date_to": "2026-10-31"})).json()

    assert [t["tag"] for t in tags["items"]] == ["Trip"]
    assert tags["names"] == ["Trip", "Savings goal", "Work"]


class TestReview:
  @pytest.mark.asyncio
  async def test_imports_arrive_unreviewed(self, session: AsyncSession, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    account = await _account(save_fixture, user)
    parsed = ParsedTransaction(
      transaction_date=date(2026, 10, 2), amount_minor=4_900, currency="SEK", direction=DEBIT, dedup_hash=uuid4().hex, description="Kiosk", raw_data={}
    )

    await transaction_service.import_transactions(
      session, bank_account_id=account.id, bank_name="test", file_format="csv", raw_content="", parsed=[parsed], user_id=user.id
    )

    [imported] = (await client.get("/v1/transactions")).json()["items"]
    assert imported["reviewed"] is False
    assert await _listed(client, to_review="true") == ["Kiosk"]

  @pytest.mark.asyncio
  async def test_to_review_leaves_out_reviewed_ones_and_investment_accounts_movements(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    checking = await _account(save_fixture, user)
    isk = await _account(save_fixture, user, "ISK", subtype="isk")
    await _transaction(save_fixture, checking, "New")
    await _transaction(save_fixture, checking, "Seen", reviewed=True)
    await _transaction(save_fixture, isk, "Buy fund")

    to_review = (await client.get("/v1/transactions", params={"to_review": "true", "limit": 1})).json()

    assert [t["description"] for t in to_review["items"]] == ["New"]
    assert to_review["pagination"]["total_count"] == 1

  @pytest.mark.asyncio
  async def test_one_by_one_and_back(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    taxi = await _transaction(save_fixture, await _account(save_fixture, user), "Taxi")

    reviewed = (await client.patch(f"/v1/transactions/{taxi.id}", json={"reviewed": True})).json()
    again = (await client.patch(f"/v1/transactions/{taxi.id}", json={"reviewed": False})).json()

    assert (reviewed["reviewed"], again["reviewed"]) == (True, False)

  @pytest.mark.asyncio
  async def test_in_bulk_only_the_given_ones_and_nothing_else_changes(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    account = await _account(save_fixture, user)
    food = Category(name="Mat", slug="mat", user_id=user.id)
    await save_fixture(food)
    hotel = await _transaction(save_fixture, account, "Hotel", category_id=food.id, tags=["Trip"])
    taxi = await _transaction(save_fixture, account, "Taxi")
    await _transaction(save_fixture, account, "Groceries")

    response = await client.post("/v1/transactions/review", json={"ids": [str(hotel.id), str(taxi.id)]})

    listed = {t["description"]: (t["reviewed"], t["category_id"], t["tags"]) for t in (await client.get("/v1/transactions")).json()["items"]}
    assert response.json() == {"updated": 2}
    assert listed == {"Hotel": (True, str(food.id), ["Trip"]), "Taxi": (True, None, []), "Groceries": (False, None, [])}

    await client.post("/v1/transactions/review", json={"ids": [str(taxi.id)], "reviewed": False})
    assert await _listed(client, to_review="true") == ["Groceries", "Taxi"]
