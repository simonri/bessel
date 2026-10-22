import json
from datetime import date
from uuid import uuid4

import pytest
from api.categories.rules import best_rule
from api.models.bank_account import BankAccount
from api.models.category import Category
from api.models.category_rule import CategoryRule, RuleScope
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.tests.fixtures.database import SaveFixture
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.repository import RuleCandidate
from api.transactions.service import transaction_service
from httpx import AsyncClient
from sqlalchemy import select

DEBIT, CREDIT = TransactionDirection.debit, TransactionDirection.credit
DAY = date(2026, 9, 10)


def _rule(pattern: str, *, scope: RuleScope = RuleScope.any, direction: TransactionDirection | None = None) -> CategoryRule:
  return CategoryRule(id=uuid4(), user_id=uuid4(), category_id=uuid4(), pattern=pattern, scope=scope, direction=direction, mark_business=False)


def _candidate(description: str, *, direction: TransactionDirection = DEBIT, company: bool = False) -> RuleCandidate:
  return RuleCandidate(id=uuid4(), description=description, direction=direction, company_account=company)


class TestBestRule:
  def test_the_longest_text_wins(self) -> None:
    tax, vat = _rule("skatt"), _rule("moms")
    assert best_rule([vat, tax], _candidate("F-skatt + moms")) is tax

  def test_case_and_position_dont_matter(self) -> None:
    grab = _rule("grab")
    assert best_rule([grab], _candidate("GRAB* A-4K2 Singapore")) is grab
    assert best_rule([grab], _candidate("Uber")) is None

  def test_a_rule_for_the_accounts_owner_beats_a_general_one(self) -> None:
    general, company = _rule("Allente bredband"), _rule("Allente", scope=RuleScope.company)
    private = _rule("Allente", scope=RuleScope.private)
    assert best_rule([general, company, private], _candidate("Allente bredband", company=True)) is company
    assert best_rule([general, company, private], _candidate("Allente bredband")) is private
    assert best_rule([private], _candidate("Allente bredband", company=True)) is None

  def test_direction_limits_a_rule(self) -> None:
    salary = _rule("LÖN", direction=CREDIT)
    assert best_rule([salary], _candidate("LÖN", direction=CREDIT)) is salary
    assert best_rule([salary], _candidate("LÖN", direction=DEBIT)) is None


class _Setup:
  def __init__(self, save_fixture: SaveFixture, user: User) -> None:
    self.save_fixture, self.user = save_fixture, user

  async def account(self, name: str, *, business: bool = False, subtype: str = "checking") -> BankAccount:
    account = BankAccount(name=name, currency="SEK", base_balance=0, subtype=subtype, is_business=business, user_id=self.user.id)
    await self.save_fixture(account)
    return account

  async def category(self, name: str) -> Category:
    category = Category(name=name, slug=name.lower(), color="#22c55e", user_id=self.user.id)
    await self.save_fixture(category)
    return category

  async def rule(self, category: Category, pattern: str, **kwargs: object) -> None:
    await self.save_fixture(CategoryRule(user_id=self.user.id, category_id=category.id, pattern=pattern, **kwargs))


@pytest.fixture
def setup(save_fixture: SaveFixture, user: User) -> _Setup:
  return _Setup(save_fixture, user)


async def _import(session: AsyncSession, account: BankAccount, rows: list[tuple[str, int, TransactionDirection]]) -> None:
  parsed = [
    ParsedTransaction(transaction_date=DAY, amount_minor=amount, currency="SEK", direction=direction, dedup_hash=uuid4().hex, description=text, raw_data={})
    for text, amount, direction in rows
  ]
  await transaction_service.import_transactions(
    session, bank_account_id=account.id, bank_name="test", file_format="api", raw_content=json.dumps([]), parsed=parsed, user_id=account.user_id
  )


async def _categories(session: AsyncSession, account: BankAccount) -> dict[str | None, tuple[str | None, bool]]:
  rows = await session.execute(
    select(Transaction.description, Category.name, Transaction.is_business)
    .outerjoin(Category, Category.id == Transaction.category_id)
    .where(Transaction.bank_account_id == account.id)
  )
  return {description: (category, business) for description, category, business in rows}


class TestOnImport:
  @pytest.mark.asyncio
  async def test_imports_arrive_sorted_by_the_rules(self, session: AsyncSession, setup: _Setup) -> None:
    skandia, marginalen = await setup.account("Skandia"), await setup.account("Marginalen", business=True)
    food, phone, outlay = [await setup.category(n) for n in ("Mat", "Telefon", "Utlägg")]
    await setup.rule(food, "ICA")
    await setup.rule(phone, "Allente", scope=RuleScope.company)
    await setup.rule(outlay, "LATITUDE.SH", scope=RuleScope.private, mark_business=True)

    await _import(session, skandia, [("ICA Kvantum", 50000, DEBIT), ("Allente", 57800, DEBIT), ("LATITUDE.SH LLC", 700000, DEBIT), ("Pressbyrån", 3500, DEBIT)])
    await _import(session, marginalen, [("Allente bredband", 57800, DEBIT)])

    assert await _categories(session, skandia) == {
      "ICA Kvantum": ("Mat", False),
      "Allente": (None, False),
      "LATITUDE.SH LLC": ("Utlägg", True),
      "Pressbyrån": (None, False),
    }
    assert await _categories(session, marginalen) == {"Allente bredband": ("Telefon", False)}

  @pytest.mark.asyncio
  async def test_investment_buys_and_paired_transfers_are_left_alone(self, session: AsyncSession, setup: _Setup) -> None:
    skandia, klarna, isk = await setup.account("Skandia"), await setup.account("Klarna"), await setup.account("ISK", subtype="isk")
    everything = await setup.category("Allt")
    await setup.rule(everything, "n")

    await _import(session, isk, [("Köp fond", 100000, DEBIT)])
    await _import(session, skandia, [("Swish till Klarna", 200000, DEBIT)])
    await _import(session, klarna, [("Incoming transaction", 200000, CREDIT)])

    assert (await _categories(session, isk))["Köp fond"] == (None, False)
    assert (await _categories(session, skandia))["Swish till Klarna"] == (None, False)


class TestRulesApi:
  @pytest.mark.asyncio
  async def test_a_new_rule_sorts_what_is_already_here_but_never_a_users_own_choice(
    self, client: AsyncClient, session: AsyncSession, setup: _Setup, save_fixture: SaveFixture, user: User
  ) -> None:
    skandia = await setup.account("Skandia")
    food, eating_out = await setup.category("Mat"), await setup.category("Restaurang")
    for text, category in (("ICA Kvantum", None), ("ICA Maxi", eating_out)):
      await save_fixture(
        Transaction(
          amount=100,
          currency="SEK",
          transaction_date=DAY,
          direction=DEBIT,
          dedup_hash=uuid4().hex,
          description=text,
          bank_account_id=skandia.id,
          category_id=category.id if category else None,
          user_id=user.id,
        )
      )

    response = await client.post("/v1/categories/rules", json={"category_id": str(food.id), "pattern": "ica"})

    assert response.status_code == 201 and response.json()["categorized"] == 1
    assert await _categories(session, skandia) == {"ICA Kvantum": ("Mat", False), "ICA Maxi": ("Restaurang", False)}
    [listed] = (await client.get("/v1/categories/rules")).json()["items"]
    assert (listed["pattern"], listed["scope"]) == ("ica", "any")
    assert (await client.delete(f"/v1/categories/rules/{listed['id']}")).status_code == 204
    assert (await client.get("/v1/categories/rules")).json()["items"] == []

  @pytest.mark.asyncio
  async def test_another_user_cant_see_use_or_delete_rules(self, client: AsyncClient, other_client: AsyncClient, setup: _Setup) -> None:
    food = await setup.category("Mat")
    rule = (await client.post("/v1/categories/rules", json={"category_id": str(food.id), "pattern": "ICA"})).json()

    assert (await other_client.get("/v1/categories/rules")).json()["items"] == []
    assert (await other_client.post("/v1/categories/rules", json={"category_id": str(food.id), "pattern": "ICA"})).status_code == 404
    assert (await other_client.delete(f"/v1/categories/rules/{rule['id']}")).status_code == 404
    assert len((await client.get("/v1/categories/rules")).json()["items"]) == 1


class TestRulesAndTransfers:
  @pytest.mark.asyncio
  async def test_a_rules_choice_gives_way_when_the_other_side_of_a_transfer_arrives(self, session: AsyncSession, setup: _Setup) -> None:
    skandia, revolut = await setup.account("Skandia"), await setup.account("Revolut")
    await setup.rule(await setup.category("Resor"), "Revolut")

    await _import(session, skandia, [("Revolut top-up", 100000, DEBIT)])
    assert (await _categories(session, skandia))["Revolut top-up"] == ("Resor", False)
    await _import(session, revolut, [("Top-up by card", 100000, CREDIT)])

    paired = (await session.execute(select(Transaction.transfer_id, Transaction.category_id, Transaction.category_rule_id))).all()
    assert len({transfer_id for transfer_id, _, _ in paired}) == 1 and all(t is not None for t, _, _ in paired)
    assert [(category, rule) for _, category, rule in paired] == [(None, None), (None, None)]

  @pytest.mark.asyncio
  async def test_a_category_the_user_chose_is_never_paired_or_resorted(self, client: AsyncClient, session: AsyncSession, setup: _Setup) -> None:
    skandia, revolut = await setup.account("Skandia"), await setup.account("Revolut")
    travel, gifts = await setup.category("Resor"), await setup.category("Gåvor")
    await setup.rule(travel, "Revolut")
    await _import(session, skandia, [("Revolut top-up", 100000, DEBIT)])
    [chosen] = (await session.execute(select(Transaction.id))).scalars().all()

    assert (await client.patch(f"/v1/transactions/{chosen}", json={"category_id": str(gifts.id)})).status_code == 200
    await _import(session, revolut, [("Top-up by card", 100000, CREDIT)])

    assert (await _categories(session, skandia))["Revolut top-up"] == ("Gåvor", False)
    assert (await session.execute(select(Transaction.transfer_id).where(Transaction.transfer_id.is_not(None)))).all() == []

  @pytest.mark.asyncio
  async def test_categorizing_many_by_hand_makes_them_the_users_choice(self, client: AsyncClient, session: AsyncSession, setup: _Setup) -> None:
    skandia = await setup.account("Skandia")
    travel, gifts = await setup.category("Resor"), await setup.category("Gåvor")
    await setup.rule(travel, "Revolut")
    await _import(session, skandia, [("Revolut top-up", 100000, DEBIT), ("Revolut top-up 2", 2000, DEBIT)])
    first, second = (await session.execute(select(Transaction.id, Transaction.description).order_by(Transaction.description))).all()

    await client.patch("/v1/transactions/bulk", json={"ids": [str(first.id)], "category_id": str(gifts.id)})
    await client.post("/v1/transactions/categorize-by-description", json={"description": second.description, "category_id": str(gifts.id)})

    assert (await session.execute(select(Transaction.category_rule_id))).scalars().all() == [None, None]
