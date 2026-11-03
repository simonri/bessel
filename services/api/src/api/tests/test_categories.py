from datetime import date
from typing import Any
from uuid import UUID, uuid4

import pytest
from api.categories.service import slugify
from api.models.bank_account import BankAccount
from api.models.category_rule import CategoryRule
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient
from sqlalchemy import select

DAY = date(2026, 9, 10)


class _Setup:
  def __init__(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    self.client, self.save_fixture, self.user = client, save_fixture, user
    self._account: BankAccount | None = None

  async def category(self, name: str, **body: Any) -> dict[str, Any]:
    response = await self.client.post("/v1/categories", json={"name": name, **body})
    assert response.status_code == 201, response.text
    return response.json()

  async def tree(self) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Two groups, and a category in the first."""
    private, outside = await self.category("Privat"), await self.category("Utanför rapporter", excluded=True)
    return private, outside, await self.category("Mat", parent_id=private["id"])

  async def rule(self, category: dict[str, Any], pattern: str) -> CategoryRule:
    rule = CategoryRule(user_id=self.user.id, category_id=UUID(category["id"]), pattern=pattern)
    await self.save_fixture(rule)
    return rule

  async def transaction(self, text: str, category: dict[str, Any], *, rule: CategoryRule | None = None) -> Transaction:
    if self._account is None:
      self._account = BankAccount(name="Skandia", currency="SEK", base_balance=0, subtype="checking", user_id=self.user.id)
      await self.save_fixture(self._account)
    transaction = Transaction(
      amount=100,
      currency="SEK",
      transaction_date=DAY,
      direction=TransactionDirection.debit,
      dedup_hash=uuid4().hex,
      description=text,
      bank_account_id=self._account.id,
      category_id=UUID(category["id"]),
      category_rule_id=rule.id if rule else None,
      user_id=self.user.id,
    )
    await self.save_fixture(transaction)
    return transaction


@pytest.fixture
def setup(client: AsyncClient, save_fixture: SaveFixture, user: User) -> _Setup:
  return _Setup(client, save_fixture, user)


async def _filed(session: AsyncSession) -> dict[str | None, tuple[UUID | None, UUID | None]]:
  rows = await session.execute(select(Transaction.description, Transaction.category_id, Transaction.category_rule_id))
  return {description: (category_id, rule_id) for description, category_id, rule_id in rows}


async def _listed(client: AsyncClient) -> dict[str, dict[str, Any]]:
  return {c["name"]: c for c in (await client.get("/v1/categories")).json()["items"]}


class TestSlug:
  def test_is_ascii_and_dashed(self) -> None:
    assert slugify("Mat & dagligvaror") == "mat-dagligvaror"
    assert slugify("Utanför rapporter") == "utanfor-rapporter"
    assert slugify("&&") == "category"


class TestCreating:
  @pytest.mark.asyncio
  async def test_a_category_is_kept_out_of_reports_like_its_group_unless_told(self, setup: _Setup) -> None:
    private, outside, _ = await setup.tree()

    assert (await setup.category("Lån", parent_id=outside["id"]))["excluded"] is True
    assert (await setup.category("Lön", parent_id=outside["id"], excluded=False, income=True))["excluded"] is False
    created = await setup.category("Resor", parent_id=private["id"], color="#ff8800")
    assert (created["excluded"], created["slug"], created["color"], created["parent_id"]) == (False, "resor", "#ff8800", private["id"])

  @pytest.mark.asyncio
  async def test_categories_go_one_level_deep(self, client: AsyncClient, setup: _Setup) -> None:
    _, _, food = await setup.tree()

    response = await client.post("/v1/categories", json={"name": "Frukt", "parent_id": food["id"]})

    assert response.status_code == 400
    assert "Frukt" not in await _listed(client)


class TestEditing:
  @pytest.mark.asyncio
  async def test_renames_recolors_and_moves_between_groups(self, client: AsyncClient, setup: _Setup) -> None:
    _, outside, food = await setup.tree()

    response = await client.patch(
      f"/v1/categories/{food['id']}", json={"name": "Mat & dryck", "color": "#123456", "parent_id": outside["id"], "excluded": True}
    )

    assert response.status_code == 200
    edited = (await _listed(client))["Mat & dryck"]
    assert (edited["slug"], edited["color"], edited["parent_id"], edited["excluded"]) == ("mat-dryck", "#123456", outside["id"], True)

  @pytest.mark.asyncio
  async def test_groups_stay_groups_and_categories_stay_in_one(self, client: AsyncClient, setup: _Setup) -> None:
    private, outside, food = await setup.tree()

    assert (await client.patch(f"/v1/categories/{outside['id']}", json={"parent_id": private["id"]})).status_code == 400
    assert (await client.patch(f"/v1/categories/{food['id']}", json={"parent_id": None})).status_code == 400
    assert (await client.patch(f"/v1/categories/{private['id']}", json={"parent_id": None, "name": "Eget"})).status_code == 200

    listed = await _listed(client)
    assert (listed["Utanför rapporter"]["parent_id"], listed["Mat"]["parent_id"], listed["Eget"]["parent_id"]) == (None, private["id"], None)


class TestDeleting:
  @pytest.mark.asyncio
  async def test_refused_while_it_holds_transactions_or_rules(self, client: AsyncClient, session: AsyncSession, setup: _Setup) -> None:
    private, _, food = await setup.tree()
    snacks = await setup.category("Snacks", parent_id=private["id"])
    await setup.transaction("ICA Kvantum", food)
    await setup.rule(snacks, "Pressbyrån")

    held = await client.delete(f"/v1/categories/{food['id']}")
    ruled = await client.delete(f"/v1/categories/{snacks['id']}")

    assert (held.status_code, ruled.status_code) == (409, 409)
    assert "1 transaction and 0 rules" in held.json()["detail"]
    listed = await _listed(client)
    assert (listed["Mat"]["transaction_count"], listed["Snacks"]["rule_count"]) == (1, 1)
    assert (await _filed(session))["ICA Kvantum"][0] == UUID(food["id"])

  @pytest.mark.asyncio
  async def test_an_unused_one_just_goes(self, client: AsyncClient, setup: _Setup) -> None:
    private, _, _ = await setup.tree()
    snacks = await setup.category("Snacks", parent_id=private["id"])

    assert (await client.delete(f"/v1/categories/{snacks['id']}")).status_code == 204
    assert "Snacks" not in await _listed(client)

  @pytest.mark.asyncio
  async def test_moving_takes_its_transactions_and_rules_along(self, client: AsyncClient, session: AsyncSession, setup: _Setup) -> None:
    private, _, food = await setup.tree()
    groceries = await setup.category("Dagligvaror", parent_id=private["id"])
    ica = await setup.rule(food, "ICA")
    await setup.transaction("ICA Kvantum", food, rule=ica)
    await setup.transaction("Coop", food)

    assert (await client.delete(f"/v1/categories/{food['id']}", params={"move_to": groceries["id"]})).status_code == 204

    assert await _filed(session) == {"ICA Kvantum": (UUID(groceries["id"]), ica.id), "Coop": (UUID(groceries["id"]), None)}
    [rule] = (await client.get("/v1/categories/rules")).json()["items"]
    assert (rule["category_id"], rule["transaction_count"]) == (groceries["id"], 1)
    assert "Mat" not in await _listed(client)

  @pytest.mark.asyncio
  async def test_leaving_them_uncategorized_also_ends_its_rules(self, client: AsyncClient, session: AsyncSession, setup: _Setup) -> None:
    _, _, food = await setup.tree()
    ica = await setup.rule(food, "ICA")
    await setup.transaction("ICA Kvantum", food, rule=ica)

    assert (await client.delete(f"/v1/categories/{food['id']}", params={"leave_uncategorized": True})).status_code == 204

    assert await _filed(session) == {"ICA Kvantum": (None, None)}
    assert (await client.get("/v1/categories/rules")).json()["items"] == []

  @pytest.mark.asyncio
  async def test_a_group_must_be_empty_and_is_no_place_to_move_to(self, client: AsyncClient, session: AsyncSession, setup: _Setup) -> None:
    private, outside, food = await setup.tree()
    await setup.transaction("ICA Kvantum", food)

    assert (await client.delete(f"/v1/categories/{private['id']}", params={"leave_uncategorized": True})).status_code == 409
    assert (await client.delete(f"/v1/categories/{food['id']}", params={"move_to": outside["id"]})).status_code == 400
    assert (await client.delete(f"/v1/categories/{food['id']}", params={"move_to": food["id"]})).status_code == 400

    assert set(await _listed(client)) == {"Privat", "Utanför rapporter", "Mat"}
    assert (await _filed(session))["ICA Kvantum"][0] == UUID(food["id"])
