from datetime import UTC, date, datetime
from typing import Any
from uuid import uuid4

import pytest
import pytest_asyncio
from api.mcp.tools import money
from api.models.avanza import AvanzaAccount, AvanzaConnection, HoldingSnapshot
from api.models.bank_account import BankAccount
from api.models.category import Category
from api.models.security import AssetType, Security
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error
from mcp.server.mcpserver.exceptions import ToolError

TODAY = date(2026, 10, 15)
DEBIT, CREDIT = TransactionDirection.debit, TransactionDirection.credit


@pytest.fixture(autouse=True)
def frozen_today(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(money, "today_in", lambda tz: TODAY)
  monkeypatch.setattr(money, "utc_now", lambda: datetime(2026, 10, 15, 12, tzinfo=UTC))


@pytest_asyncio.fixture(autouse=True)
async def in_stockholm(session: AsyncSession, user: User, other_user: User) -> None:
  user.timezone = other_user.timezone = "Europe/Stockholm"
  await session.flush()


async def _account(save_fixture: SaveFixture, user: User, name: str, *, business: bool = False, base: int = 0, subtype: str = "checking") -> BankAccount:
  account = BankAccount(name=name, currency="SEK", base_balance=base, subtype=subtype, is_business=business, user_id=user.id)
  await save_fixture(account)
  return account


async def _category(save_fixture: SaveFixture, user: User, name: str, **fields: Any) -> Category:
  category = Category(name=name, slug=name.lower(), user_id=user.id, **fields)
  await save_fixture(category)
  return category


async def _transaction(
  save_fixture: SaveFixture,
  account: BankAccount,
  day: date,
  amount: int,
  direction: TransactionDirection,
  description: str,
  category: Category | None = None,
  **fields: Any,
) -> Transaction:
  transaction = Transaction(
    amount=amount,
    currency="SEK",
    transaction_date=day,
    direction=direction,
    dedup_hash=uuid4().hex,
    description=description,
    category_id=category.id if category else None,
    bank_account_id=account.id,
    user_id=account.user_id,
    **fields,
  )
  await save_fixture(transaction)
  return transaction


@pytest_asyncio.fixture
async def books(save_fixture: SaveFixture, user: User, other_user: User) -> None:
  """September 2026: a salary, food with a refund, a company cost paid privately, and the company's own server bill."""
  skandia = await _account(save_fixture, user, "Skandia", base=100_000)
  marginalen = await _account(save_fixture, user, "Marginalen", business=True)
  food = await _category(save_fixture, user, "Mat")
  salary = await _category(save_fixture, user, "Lön", income=True)
  outlay = await _category(save_fixture, user, "Utlägg för företaget", excluded=True)
  await _transaction(save_fixture, skandia, date(2026, 9, 3), 12_950, DEBIT, "ICA NARA", food, name="Lunch")
  await _transaction(save_fixture, skandia, date(2026, 9, 10), 2_000, CREDIT, "ICA NARA", food)
  await _transaction(save_fixture, skandia, date(2026, 9, 12), 30_000, DEBIT, "CLOUDFLARE", outlay, is_business=True)
  await _transaction(save_fixture, skandia, date(2026, 9, 25), 3_000_000, CREDIT, "LON", salary)
  await _transaction(save_fixture, marginalen, date(2026, 9, 5), 50_000, DEBIT, "HETZNER", note="Servrar")
  secret = await _account(save_fixture, other_user, "Secret")
  await _transaction(save_fixture, secret, date(2026, 9, 4), 99_900, DEBIT, "SECRET SHOP")


class TestFinancesOverview:
  @pytest.mark.asyncio
  @pytest.mark.usefixtures("books")
  async def test_accounts_owner_balances_and_totals_are_in_currency_units(self, connect: ConnectFixture) -> None:
    overview = await mcp_call(connect, "get_finances_overview")

    accounts = {a["name"]: (a["owner"], a["kind"], a["balance"], a["source"]) for a in overview["accounts"]}
    assert accounts == {
      "Skandia": ("personal", "cash", 30_590.5, "Imported by hand"),
      "Marginalen": ("company", "cash", -500.0, "Imported by hand"),
    }
    totals = {t["owner"]: (t["currency"], t["cash"], t["net"]) for t in overview["totals"]}
    assert totals == {"personal": ("SEK", 30_590.5, 30_590.5), "company": ("SEK", -500.0, -500.0)}
    [series] = overview["net_worth"]
    assert series["currency"] == "SEK"
    assert series["months"][-2:] == [{"month": "2026-09", "value": 30_090.5}, {"month": "2026-10", "value": 30_090.5}]

  @pytest.mark.asyncio
  @pytest.mark.usefixtures("books")
  async def test_another_user_sees_only_their_own_accounts(self, connect: ConnectFixture) -> None:
    overview = await mcp_call(connect, "get_finances_overview", token="token-b")

    assert [a["name"] for a in overview["accounts"]] == ["Secret"]


class TestMonthSummary:
  @pytest.mark.asyncio
  @pytest.mark.usefixtures("books")
  async def test_counts_only_the_users_own_money_with_refunds_taken_off(self, connect: ConnectFixture) -> None:
    summary = await mcp_call(connect, "get_month_summary", {"month": "last month"})

    [sek] = summary["currencies"]
    assert (summary["month"], sek["currency"], sek["income"], sek["spending"], sek["net"]) == ("2026-09", "SEK", 30_000.0, 109.5, 29_890.5)
    assert sek["categories"] == [{"category": "Mat", "spent": 109.5, "transactions": 2}]
    assert sek["top_merchants"] == [{"merchant": "Lunch", "spent": 129.5, "transactions": 1}]
    assert sek["last_12_months"][-1] == {"month": "2026-09", "income": 30_000.0, "spending": 109.5}
    assert (summary["uncategorized"], summary["transfers_left_out"]) == (0, 0)

  @pytest.mark.asyncio
  @pytest.mark.usefixtures("books")
  async def test_another_users_month_is_their_own(self, connect: ConnectFixture) -> None:
    summary = await mcp_call(connect, "get_month_summary", {"month": "2026-09"}, token="token-b")

    [sek] = summary["currencies"]
    assert (sek["spending"], sek["top_merchants"][0]["merchant"]) == (999.0, "SECRET SHOP")

  @pytest.mark.asyncio
  async def test_a_month_is_this_last_or_written_out(self, connect: ConnectFixture) -> None:
    assert money.parse_month("this month", TODAY) == (2026, 10)
    assert money.parse_month("Last month", date(2026, 1, 9)) == (2025, 12)
    assert money.parse_month("2025-03", TODAY) == (2025, 3)
    with pytest.raises(ToolError, match="YYYY-MM"):
      money.parse_month("2025-13", TODAY)
    assert "YYYY-MM" in await mcp_call_error(connect, "get_month_summary", {"month": "september"})


class TestSearchTransactions:
  @staticmethod
  async def _search(connect: ConnectFixture, token: str = "token-a", **arguments: Any) -> list[str]:
    found = await mcp_call(connect, "search_transactions", arguments, token=token)
    return [t["bank_text"] for t in found["transactions"]]

  @pytest.mark.asyncio
  @pytest.mark.usefixtures("books")
  async def test_each_transaction_says_what_it_is_newest_first(self, connect: ConnectFixture) -> None:
    found = await mcp_call(connect, "search_transactions", {"start": "2026-09-01", "end": "2026-09-04"})

    assert found["total_count"] == 1
    [lunch] = found["transactions"]
    assert {
      k: lunch[k] for k in ("date", "name", "bank_text", "amount", "currency", "direction", "category", "account", "company", "transfer", "invoices")
    } == {
      "date": "2026-09-03",
      "name": "Lunch",
      "bank_text": "ICA NARA",
      "amount": 129.5,
      "currency": "SEK",
      "direction": "out",
      "category": "Mat",
      "account": "Skandia",
      "company": False,
      "transfer": False,
      "invoices": 0,
    }
    assert await self._search(connect) == ["LON", "CLOUDFLARE", "ICA NARA", "HETZNER", "ICA NARA"]

  @pytest.mark.asyncio
  @pytest.mark.usefixtures("books")
  async def test_company_money_is_its_accounts_and_costs_paid_privately(self, connect: ConnectFixture) -> None:
    every = (await mcp_call(connect, "search_transactions"))["transactions"]
    assert [(t["bank_text"], t["name"], t["company"]) for t in every] == [
      ("LON", "LON", False),
      ("CLOUDFLARE", "CLOUDFLARE", True),
      ("ICA NARA", "ICA NARA", False),
      ("HETZNER", "HETZNER", True),
      ("ICA NARA", "Lunch", False),
    ]
    assert await self._search(connect, company=True) == ["CLOUDFLARE", "HETZNER"]
    assert await self._search(connect, company=False) == ["LON", "ICA NARA", "ICA NARA"]

  @pytest.mark.asyncio
  @pytest.mark.usefixtures("books")
  async def test_filters_by_text_category_account_and_direction(self, connect: ConnectFixture) -> None:
    assert await self._search(connect, text="servrar") == ["HETZNER"]
    assert await self._search(connect, text="lunch") == ["ICA NARA"]
    assert await self._search(connect, category="mat") == ["ICA NARA", "ICA NARA"]
    assert await self._search(connect, category="at") == ["ICA NARA", "ICA NARA"]
    assert await self._search(connect, category="l") == ["LON"]
    assert await self._search(connect, account="marg") == ["HETZNER"]
    assert await self._search(connect, direction="in") == ["LON", "ICA NARA"]
    assert await self._search(connect, limit=2) == ["LON", "CLOUDFLARE"]

  @pytest.mark.asyncio
  @pytest.mark.usefixtures("books")
  async def test_an_unknown_or_unclear_name_lists_the_choices(self, connect: ConnectFixture) -> None:
    assert (
      await mcp_call_error(connect, "search_transactions", {"account": "Nordea"}) == "No account called 'Nordea'. The user's accounts: Marginalen, Skandia."
    )
    assert "Mat" in await mcp_call_error(connect, "search_transactions", {"category": "Resor"})
    assert await mcp_call_error(connect, "search_transactions", {"account": "a"}) == "'a' matches several accounts: Marginalen, Skandia. Use the full name."

  @pytest.mark.asyncio
  @pytest.mark.usefixtures("books")
  async def test_another_user_finds_only_their_own(self, connect: ConnectFixture) -> None:
    assert await self._search(connect, token="token-b") == ["SECRET SHOP"]
    assert await mcp_call_error(connect, "search_transactions", {"account": "Skandia"}, token="token-b") == (
      "No account called 'Skandia'. The user's accounts: Secret."
    )


class TestInvestments:
  @pytest.mark.asyncio
  async def test_accounts_and_positions_in_currency_units(self, connect: ConnectFixture, save_fixture: SaveFixture, user: User) -> None:
    kf = await _account(save_fixture, user, "Avanza - KF", business=True, subtype="kf")
    await _transaction(save_fixture, kf, date(2026, 3, 1), 1_000_000, CREDIT, "Insättning", transaction_type="DEPOSIT")
    await _transaction(save_fixture, kf, date(2026, 6, 1), 5_000, CREDIT, "Utdelning", transaction_type="DIVIDEND")
    await _transaction(save_fixture, kf, date(2026, 4, 1), 3_000, DEBIT, "Avkastningsskatt", transaction_type="TAX")
    await _transaction(save_fixture, kf, date(2025, 12, 1), 1_000, DEBIT, "Avgift", transaction_type="FEE")
    fund = Security(name="Global fund", ticker="GLOB", asset_type=AssetType.mutual_fund, currency="SEK", isin="SE0000000009")
    await save_fixture(fund)
    snapshot = HoldingSnapshot(
      user_id=user.id,
      bank_account_id=kf.id,
      security_id=fund.id,
      snapshot_date=TODAY,
      quantity=2_500_000,
      value=1_200_000,
      acquired_value=1_000_000,
      currency="SEK",
    )
    await save_fixture(snapshot)
    avanza = AvanzaConnection(user_id=user.id, username="simon", encrypted_credentials="unused")
    await save_fixture(avanza)
    await save_fixture(AvanzaAccount(connection_id=avanza.id, external_id="1", name="KF", account_type="KF", bank_account_id=kf.id))

    investments = await mcp_call(connect, "get_investments")

    [account] = investments["accounts"]
    assert {k: account[k] for k in ("name", "owner", "total", "holdings_value", "cash", "net_deposits", "growth", "dividends", "tax_and_fees")} == {
      "name": "Avanza - KF",
      "owner": "company",
      "total": 22_010.0,
      "holdings_value": 12_000.0,
      "cash": 10_010.0,
      "net_deposits": 10_000.0,
      "growth": 12_010.0,
      "dividends": [{"year": 2026, "amount": 50.0}],
      "tax_and_fees": [{"year": 2026, "amount": -30.0}, {"year": 2025, "amount": -10.0}],
    }
    [holding] = investments["holdings"]
    assert {k: holding[k] for k in ("name", "ticker", "account", "quantity", "value", "cost", "gain")} == {
      "name": "Global fund",
      "ticker": "GLOB",
      "account": "Avanza - KF",
      "quantity": 2.5,
      "value": 12_000.0,
      "cost": 10_000.0,
      "gain": 2_000.0,
    }
    assert await mcp_call(connect, "get_investments", token="token-b") == {"accounts": [], "holdings": []}
