import json
from datetime import date
from uuid import uuid4

import pytest
import pytest_asyncio
from api.models.bank_account import BankAccount
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.tests.fixtures.database import SaveFixture
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.service import transaction_service
from httpx import AsyncClient
from sqlalchemy import select

DAY = date(2026, 10, 22)


@pytest_asyncio.fixture
async def account(save_fixture: SaveFixture, user: User) -> BankAccount:
  bank_account = BankAccount(name="Klarna", currency="SEK", base_balance=0, subtype="credit", user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


async def _add(save_fixture: SaveFixture, account: BankAccount, description: str, *, amount: int = 99_000, **fields: object) -> Transaction:
  transaction = Transaction(
    amount=amount,
    currency="SEK",
    transaction_date=DAY,
    direction=TransactionDirection.debit,
    dedup_hash=uuid4().hex,
    description=description,
    bank_account_id=account.id,
    user_id=account.user_id,
    **fields,
  )
  await save_fixture(transaction)
  return transaction


async def _import(session: AsyncSession, account: BankAccount, *descriptions: str) -> None:
  parsed = [
    ParsedTransaction(
      transaction_date=DAY, amount_minor=1000, currency="SEK", direction=TransactionDirection.debit, dedup_hash=uuid4().hex, description=text, raw_data={}
    )
    for text in descriptions
  ]
  await transaction_service.import_transactions(
    session, bank_account_id=account.id, bank_name="test", file_format="api", raw_content=json.dumps([]), parsed=parsed, user_id=account.user_id
  )


async def _names(session: AsyncSession, account: BankAccount) -> list[tuple[str | None, str | None]]:
  rows = await session.execute(
    select(Transaction.description, Transaction.name)
    .where(Transaction.bank_account_id == account.id)
    .order_by(Transaction.description, Transaction.name.nulls_first(), Transaction.id)
  )
  return [tuple(row) for row in rows]


class TestRename:
  @pytest.mark.asyncio
  async def test_names_only_this_one_keeps_the_bank_text_and_suggests_likely_others(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    this = await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB")
    for _ in range(2):
      await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB")
    await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB", name="My own name")
    for _ in range(3):
      await _add(save_fixture, account, "CLAUDE.AI SUBSCRIPTION")
    await _add(save_fixture, account, "claude.ai api credits", name="Claude API")
    await _add(save_fixture, account, "ICA Maxi")

    response = await client.put(f"/v1/transactions/{this.id}/name", json={"name": "  Claude Max  "})

    assert response.status_code == 200
    body = response.json()
    assert (body["name"], body["description"]) == ("Claude Max", "ANTHROPIC* CLAUDE SUB")
    assert body["suggestions"] == [
      {"description": "ANTHROPIC* CLAUDE SUB", "count": 2},
      {"description": "CLAUDE.AI SUBSCRIPTION", "count": 3},
    ]
    assert [name for description, name in await _names(session, account) if description == "ANTHROPIC* CLAUDE SUB"] == [None, None, "Claude Max", "My own name"]

  @pytest.mark.asyncio
  async def test_short_and_common_words_suggest_nothing(self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount) -> None:
    this = await _add(save_fixture, account, "SPOTIFY P2B3C")
    await _add(save_fixture, account, "AB Svenska Spel")
    await _add(save_fixture, account, "Skolavgift och fritid")

    body = (await client.put(f"/v1/transactions/{this.id}/name", json={"name": "AB fika och lunch"})).json()

    assert body["suggestions"] == []

  @pytest.mark.asyncio
  async def test_a_blank_name_goes_back_to_the_bank_text(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    this = await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB", name="Claude")
    await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB")

    body = (await client.put(f"/v1/transactions/{this.id}/name", json={"name": "   "})).json()

    assert (body["name"], body["suggestions"]) == (None, [])
    assert await _names(session, account) == [("ANTHROPIC* CLAUDE SUB", None), ("ANTHROPIC* CLAUDE SUB", None)]

  @pytest.mark.asyncio
  async def test_the_bank_text_itself_is_no_name_and_suggests_nothing(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    this = await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB", name="Claude")
    await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB")

    body = (await client.put(f"/v1/transactions/{this.id}/name", json={"name": " ANTHROPIC* CLAUDE SUB "})).json()

    assert (body["name"], body["suggestions"]) == (None, [])
    assert await _names(session, account) == [("ANTHROPIC* CLAUDE SUB", None), ("ANTHROPIC* CLAUDE SUB", None)]

  @pytest.mark.asyncio
  async def test_a_name_has_a_length_limit(self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount) -> None:
    this = await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB")

    assert (await client.put(f"/v1/transactions/{this.id}/name", json={"name": "x" * 121})).status_code == 422
    assert (await client.put(f"/v1/transactions/{this.id}/name", json={"name": "x" * 120})).status_code == 200


class TestNameAll:
  @pytest.mark.asyncio
  async def test_names_every_one_with_that_bank_text_but_leaves_names_given_by_hand(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    for _ in range(2):
      await _add(save_fixture, account, "CLAUDE.AI SUBSCRIPTION")
    await _add(save_fixture, account, "CLAUDE.AI SUBSCRIPTION", name="Team plan")
    await _add(save_fixture, account, "CLAUDE.AI SUBSCRIPTION EXTRA")

    response = await client.post("/v1/transactions/names", json={"description": "CLAUDE.AI SUBSCRIPTION", "name": "Claude"})

    assert response.json() == {"renamed": 2}
    assert await _names(session, account) == [
      ("CLAUDE.AI SUBSCRIPTION", "Claude"),
      ("CLAUDE.AI SUBSCRIPTION", "Claude"),
      ("CLAUDE.AI SUBSCRIPTION", "Team plan"),
      ("CLAUDE.AI SUBSCRIPTION EXTRA", None),
    ]

  @pytest.mark.asyncio
  async def test_naming_the_same_text_again_changes_the_rules_name_but_not_one_renamed_by_hand(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    for _ in range(2):
      await _add(save_fixture, account, "CLAUDE.AI SUBSCRIPTION")
    renamed_by_hand = await _add(save_fixture, account, "CLAUDE.AI SUBSCRIPTION")
    await client.post("/v1/transactions/names", json={"description": "CLAUDE.AI SUBSCRIPTION", "name": "Claude"})
    await client.put(f"/v1/transactions/{renamed_by_hand.id}/name", json={"name": "Team plan"})

    second = await client.post("/v1/transactions/names", json={"description": "CLAUDE.AI SUBSCRIPTION", "name": "Claude Max"})

    assert second.json() == {"renamed": 2}
    assert await _names(session, account) == [("CLAUDE.AI SUBSCRIPTION", "Claude Max")] * 2 + [("CLAUDE.AI SUBSCRIPTION", "Team plan")]

  @pytest.mark.asyncio
  async def test_renaming_a_named_group_again_reaches_every_one_of_its_bank_texts(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    first, second, third = [await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB") for _ in range(3)]
    renamed_alike, _ = [await _add(save_fixture, account, "CLAUDE.AI SUBSCRIPTION") for _ in range(2)]
    await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB", name="Team plan")

    async def rename(transaction: Transaction, name: str) -> list[dict]:
      return (await client.put(f"/v1/transactions/{transaction.id}/name", json={"name": name})).json()["suggestions"]

    async def accept(suggestions: list[dict], name: str) -> None:
      for suggestion in suggestions:
        await client.post("/v1/transactions/names", json={"description": suggestion["description"], "name": name})

    await accept(await rename(first, "Claude"), "Claude")
    # Named by hand with what the group is already called: still part of the group.
    await rename(renamed_alike, "Claude")
    await rename(third, "Claude")
    again = await rename(second, "Claude Max")
    await accept(again, "Claude Max")

    assert again == [{"description": "ANTHROPIC* CLAUDE SUB", "count": 2}, {"description": "CLAUDE.AI SUBSCRIPTION", "count": 2}]
    assert await _names(session, account) == [
      ("ANTHROPIC* CLAUDE SUB", "Claude Max"),
      ("ANTHROPIC* CLAUDE SUB", "Claude Max"),
      ("ANTHROPIC* CLAUDE SUB", "Claude Max"),
      ("ANTHROPIC* CLAUDE SUB", "Team plan"),
      ("CLAUDE.AI SUBSCRIPTION", "Claude Max"),
      ("CLAUDE.AI SUBSCRIPTION", "Claude Max"),
    ]

  @pytest.mark.asyncio
  async def test_later_imports_arrive_named_and_a_name_cleared_by_hand_stays_cleared(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    earlier = await _add(save_fixture, account, "CLOUDFLARE")
    await client.post("/v1/transactions/names", json={"description": "CLOUDFLARE", "name": "Cloudflare"})
    await client.put(f"/v1/transactions/{earlier.id}/name", json={"name": None})

    await _import(session, account, "CLOUDFLARE", "CLOUDFLARE INC", "Pressbyrån")

    assert await _names(session, account) == [
      ("CLOUDFLARE", None),
      ("CLOUDFLARE", "Cloudflare"),
      ("CLOUDFLARE INC", None),
      ("Pressbyrån", None),
    ]


class TestNamesInLists:
  @pytest.mark.asyncio
  async def test_search_finds_the_name_and_the_note_as_well_as_the_bank_text(
    self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount
  ) -> None:
    await _add(save_fixture, account, "ANTHROPIC* CLAUDE SUB", name="Claude Max")
    await _add(save_fixture, account, "CLOUDFLARE", note="Domain for getbessel.com")
    await _add(save_fixture, account, "ICA Nära")

    async def found(search: str) -> list[str]:
      return [t["description"] for t in (await client.get("/v1/transactions", params={"search": search})).json()["items"]]

    assert await found("claude max") == ["ANTHROPIC* CLAUDE SUB"]
    assert await found("getbessel") == ["CLOUDFLARE"]
    assert await found("anthropic") == ["ANTHROPIC* CLAUDE SUB"]

  @pytest.mark.asyncio
  async def test_the_months_biggest_spending_adds_up_two_bank_texts_with_one_name(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    checking = BankAccount(name="Lönekonto", currency="SEK", base_balance=0, subtype="checking", user_id=user.id)
    await save_fixture(checking)
    await _add(save_fixture, checking, "CLAUDE.AI SUBSCRIPTION", amount=97_000, name="Claude")
    await _add(save_fixture, checking, "ANTHROPIC* CLAUDE SUB", amount=99_000, name="Claude")
    await _add(save_fixture, checking, "ICA Nära", amount=150_000)

    summary = (await client.get("/v1/transactions/summary", params={"year": DAY.year, "month": DAY.month})).json()

    [sek] = summary["currencies"]
    assert [(m["description"], m["total"], m["count"]) for m in sek["merchants"]] == [("Claude", 196_000, 2), ("ICA Nära", 150_000, 1)]


class TestNote:
  @pytest.mark.asyncio
  async def test_a_note_is_kept_trimmed_and_a_blank_one_removes_it(self, client: AsyncClient, save_fixture: SaveFixture, account: BankAccount) -> None:
    this = await _add(save_fixture, account, "CLOUDFLARE")

    kept = (await client.patch(f"/v1/transactions/{this.id}", json={"note": "  Domain for getbessel.com "})).json()
    untouched = (await client.patch(f"/v1/transactions/{this.id}", json={"is_business": True})).json()
    cleared = (await client.patch(f"/v1/transactions/{this.id}", json={"note": ""})).json()

    assert (kept["note"], untouched["note"], cleared["note"]) == ("Domain for getbessel.com", "Domain for getbessel.com", None)
    assert (await client.patch(f"/v1/transactions/{this.id}", json={"note": "x" * 1001})).status_code == 422
