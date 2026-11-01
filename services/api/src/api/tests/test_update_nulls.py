from datetime import date
from uuid import uuid4

import pytest
from api.models.bank_account import BankAccount
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient


class TestNullLeavesARequiredField:
  """A null sent for a field that can't be empty leaves it as it was, instead of failing with a 500."""

  @pytest.mark.asyncio
  async def test_place(self, client: AsyncClient) -> None:
    place = (await client.post("/v1/places", json={"name": "Café Ö", "latitude": 10.5, "longitude": 20.25})).json()

    resp = await client.patch(f"/v1/places/{place['id']}", json={"name": None, "latitude": None, "longitude": None, "status": None, "review": "Bra"})

    assert resp.status_code == 200, resp.text
    stored = resp.json()
    assert (stored["name"], stored["latitude"], stored["longitude"], stored["status"], stored["review"]) == ("Café Ö", 10.5, 20.25, place["status"], "Bra")

  @pytest.mark.asyncio
  async def test_place_clears_an_optional_field(self, client: AsyncClient) -> None:
    place = (await client.post("/v1/places", json={"name": "Café Ö", "latitude": 10.5, "longitude": 20.25, "address": "Storgatan 1"})).json()

    resp = await client.patch(f"/v1/places/{place['id']}", json={"address": None})

    assert resp.status_code == 200, resp.text
    assert resp.json()["address"] is None

  @pytest.mark.asyncio
  async def test_recipe(self, client: AsyncClient) -> None:
    recipe = (await client.post("/v1/recipes", json={"title": "Kladdkaka", "recipe_type": "dessert", "content": "- 2 ägg"})).json()

    resp = await client.patch(f"/v1/recipes/{recipe['id']}", json={"title": None, "recipe_type": None})

    assert resp.status_code == 200, resp.text
    stored = (await client.get(f"/v1/recipes/{recipe['id']}")).json()
    assert (stored["title"], stored["recipe_type"]) == ("Kladdkaka", "dessert")

  @pytest.mark.asyncio
  async def test_task(self, client: AsyncClient) -> None:
    task = (await client.post("/v1/tasks", json={"title": "Köp mjölk", "priority": 2, "due_date": "2026-11-02"})).json()

    resp = await client.patch(
      f"/v1/tasks/{task['id']}", json={"title": None, "status": None, "priority": None, "position": None, "is_recurring": None, "due_date": None}
    )

    assert resp.status_code == 200, resp.text
    stored = (await client.get(f"/v1/tasks/{task['id']}")).json()
    assert (stored["title"], stored["status"], stored["priority"], stored["is_recurring"]) == ("Köp mjölk", "todo", 2, False)
    assert stored["due_date"] is None

  @pytest.mark.asyncio
  async def test_bank_account(self, client: AsyncClient) -> None:
    account = (await client.post("/v1/bank-accounts", json={"name": "Lön", "currency": "SEK", "subtype": "checking"})).json()

    resp = await client.patch(
      f"/v1/bank-accounts/{account['id']}",
      json={"name": None, "currency": None, "subtype": None, "base_balance": None, "is_business": None, "include_in_net_worth": None},
    )

    assert resp.status_code == 200, resp.text
    stored = resp.json()
    assert (stored["name"], stored["currency"], stored["subtype"], stored["is_business"]) == ("Lön", "SEK", "checking", False)

  @pytest.mark.asyncio
  async def test_transaction(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    account = BankAccount(name="Lön", currency="SEK", base_balance=0, subtype="checking", user_id=user.id)
    await save_fixture(account)
    transaction = Transaction(
      amount=12_300,
      currency="SEK",
      transaction_date=date(2026, 10, 22),
      direction=TransactionDirection.debit,
      dedup_hash=uuid4().hex,
      description="ICA",
      bank_account_id=account.id,
      user_id=user.id,
    )
    await save_fixture(transaction)

    resp = await client.patch(f"/v1/transactions/{transaction.id}", json={"is_business": None})

    assert resp.status_code == 200, resp.text
    assert resp.json()["is_business"] is False
