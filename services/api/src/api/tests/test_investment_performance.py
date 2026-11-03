from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import uuid4

import pytest
from api.investments import endpoints
from api.models.avanza import AvanzaAccount, AvanzaConnection, HoldingSnapshot
from api.models.bank_account import BankAccount
from api.models.security import AssetType, Security
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient

TODAY = date(2026, 10, 15)
DEBIT, CREDIT = TransactionDirection.debit, TransactionDirection.credit


@pytest.fixture(autouse=True)
def frozen_today(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(endpoints, "utc_now", lambda: datetime(2026, 10, 15, 12, tzinfo=UTC))


def ago(days: int) -> date:
  return TODAY - timedelta(days=days)


async def _account(save_fixture: SaveFixture, user: User, name: str, *, subtype: str = "isk", currency: str = "SEK", business: bool = False) -> BankAccount:
  account = BankAccount(name=name, currency=currency, base_balance=0, subtype=subtype, is_business=business, user_id=user.id)
  await save_fixture(account)
  return account


async def _move(save_fixture: SaveFixture, account: BankAccount, day: date, amount: int, direction: TransactionDirection, kind: str) -> None:
  await save_fixture(
    Transaction(
      amount=amount,
      currency=account.currency,
      transaction_date=day,
      direction=direction,
      dedup_hash=uuid4().hex,
      description=kind.title(),
      transaction_type=kind,
      bank_account_id=account.id,
      user_id=account.user_id,
    )
  )


async def _security(save_fixture: SaveFixture, name: str, asset_type: AssetType, isin: str) -> Security:
  security = Security(name=name, asset_type=asset_type, currency="SEK", isin=isin)
  await save_fixture(security)
  return security


async def _snapshot(save_fixture: SaveFixture, account: BankAccount, security: Security, day: date, value: int) -> None:
  await save_fixture(
    HoldingSnapshot(
      user_id=account.user_id,
      bank_account_id=account.id,
      security_id=security.id,
      snapshot_date=day,
      quantity=1_000_000,
      value=value,
      acquired_value=value,
      currency=account.currency,
    )
  )


async def _link(save_fixture: SaveFixture, user: User, *accounts: BankAccount) -> None:
  avanza = AvanzaConnection(user_id=user.id, username="someone")
  await save_fixture(avanza)
  for index, account in enumerate(accounts):
    await save_fixture(AvanzaAccount(connection_id=avanza.id, external_id=str(index), name=account.name, account_type="X", bank_account_id=account.id))


def _returns(body: dict[str, Any], account: BankAccount | None, range_: str, currency: str = "SEK") -> dict[str, Any]:
  account_id = str(account.id) if account else None
  return next(r for r in body["returns"] if r["bank_account_id"] == account_id and r["range"] == range_ and r["currency"] == currency)


class TestPerformance:
  @pytest.mark.asyncio
  async def test_values_and_returns_leave_deposits_out_of_the_gain(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    isk = await _account(save_fixture, user, "ISK")
    fund = await _security(save_fixture, "Global fund", AssetType.mutual_fund, "SE0000000101")
    await _move(save_fixture, isk, ago(40), 1_000_000, CREDIT, "DEPOSIT")
    await _move(save_fixture, isk, ago(40), 1_000_000, DEBIT, "BUY")
    await _snapshot(save_fixture, isk, fund, ago(40), 1_000_000)
    await _snapshot(save_fixture, isk, fund, ago(20), 1_100_000)
    await _move(save_fixture, isk, ago(10), 500_000, CREDIT, "DEPOSIT")
    await _snapshot(save_fixture, isk, fund, ago(10), 1_100_000)

    body = (await client.get("/v1/investments/performance")).json()

    [own, total] = body["series"]
    assert own["points"] == [
      {"day": ago(40).isoformat(), "value": 1_000_000},
      {"day": ago(20).isoformat(), "value": 1_100_000},
      {"day": ago(10).isoformat(), "value": 1_600_000},
    ]
    assert (total["bank_account_id"], total["points"]) == (None, own["points"])
    month = _returns(body, isk, "1m")
    assert {k: month[k] for k in ("start", "end", "start_value", "end_value", "net_flows", "gain")} == {
      "start": ago(40).isoformat(),
      "end": ago(10).isoformat(),
      "start_value": 1_000_000,
      "end_value": 1_600_000,
      "net_flows": 500_000,
      "gain": 100_000,
    }
    assert month["time_weighted"] == pytest.approx(0.10)
    assert month["time_weighted_annualized"] is None
    assert _returns(body, None, "all")["time_weighted"] == pytest.approx(0.10)

  @pytest.mark.asyncio
  async def test_an_account_without_money_moved_says_why_and_is_left_out_of_the_total(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    isk, kf = await _account(save_fixture, user, "ISK"), await _account(save_fixture, user, "KF", subtype="kf", business=True)
    fund = await _security(save_fixture, "Global fund", AssetType.mutual_fund, "SE0000000102")
    await _move(save_fixture, isk, ago(30), 1_000_000, CREDIT, "DEPOSIT")
    await _snapshot(save_fixture, isk, fund, ago(20), 0)
    await _snapshot(save_fixture, isk, fund, ago(10), 100_000)
    await _snapshot(save_fixture, kf, fund, ago(20), 500_000)
    await _snapshot(save_fixture, kf, fund, ago(10), 900_000)

    body = (await client.get("/v1/investments/performance")).json()

    kf_returns = _returns(body, kf, "3m")
    assert kf_returns["time_weighted"] is None
    assert "money moved" in kf_returns["time_weighted_unavailable"]
    assert body["left_out"] == [{"bank_account_id": str(kf.id), "name": "KF", "reason": kf_returns["time_weighted_unavailable"]}]
    # The ISK's cash of 1,000,000 grew by 100,000; the KF's 80% isn't in the total.
    assert _returns(body, None, "3m")["time_weighted"] == pytest.approx(0.10)
    total = next(s for s in body["series"] if s["bank_account_id"] is None)
    assert total["points"][-1] == {"day": ago(10).isoformat(), "value": 1_100_000 + 900_000}

  @pytest.mark.asyncio
  async def test_an_account_valued_from_later_joins_the_total_without_counting_as_gain(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User
  ) -> None:
    old, new = await _account(save_fixture, user, "Old"), await _account(save_fixture, user, "New")
    fund = await _security(save_fixture, "Global fund", AssetType.mutual_fund, "SE0000000103")
    for account in (old, new):
      await _move(save_fixture, account, ago(100), 1, CREDIT, "DIVIDEND")
    await _snapshot(save_fixture, old, fund, ago(60), 999_999)
    await _snapshot(save_fixture, old, fund, ago(30), 1_099_999)
    await _snapshot(save_fixture, new, fund, ago(30), 4_999_999)
    await _snapshot(save_fixture, old, fund, ago(5), 1_099_999)
    await _snapshot(save_fixture, new, fund, ago(5), 5_499_999)

    body = (await client.get("/v1/investments/performance")).json()

    total = _returns(body, None, "3m")
    assert (total["start"], total["net_flows"]) == (ago(60).isoformat(), 5_000_000)
    assert total["time_weighted"] == pytest.approx(1.1 * (6_600_000 / 6_100_000) - 1)
    assert _returns(body, new, "3m")["start"] == ago(30).isoformat()

  @pytest.mark.asyncio
  async def test_an_account_without_snapshots_has_no_returns_and_currencies_stay_apart(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User
  ) -> None:
    eur = await _account(save_fixture, user, "Euro broker", currency="EUR")
    await _move(save_fixture, eur, ago(30), 100_000, CREDIT, "DEPOSIT")

    body = (await client.get("/v1/investments/performance")).json()

    assert {(s["bank_account_id"], s["currency"]) for s in body["series"]} == {(str(eur.id), "EUR"), (None, "EUR")}
    assert "daily values" in _returns(body, eur, "all", "EUR")["time_weighted_unavailable"]
    assert body["left_out"] == []

  @pytest.mark.asyncio
  async def test_another_users_accounts_are_not_in_it(self, other_client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    await _account(save_fixture, user, "ISK")

    assert (await other_client.get("/v1/investments/performance")).json() == {"series": [], "returns": [], "left_out": []}


class TestAllocation:
  @pytest.mark.asyncio
  async def test_by_asset_type_with_cash_and_by_account_per_currency(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    isk, kf = await _account(save_fixture, user, "ISK"), await _account(save_fixture, user, "KF", subtype="kf")
    eur = await _account(save_fixture, user, "Euro broker", currency="EUR")
    fund = await _security(save_fixture, "Global fund", AssetType.mutual_fund, "SE0000000104")
    stock = await _security(save_fixture, "Some company", AssetType.stock, "SE0000000105")
    await _link(save_fixture, user, isk, kf, eur)
    await _move(save_fixture, isk, ago(30), 250_000, CREDIT, "DEPOSIT")
    await _move(save_fixture, kf, ago(30), 50_000, DEBIT, "WITHDRAW")
    await _snapshot(save_fixture, isk, fund, ago(1), 500_000)
    await _snapshot(save_fixture, kf, stock, ago(1), 250_000)
    await _snapshot(save_fixture, eur, stock, ago(1), 10_000)
    # Sold since: only the latest day's positions count.
    await _snapshot(save_fixture, eur, fund, ago(3), 99_000)

    items = {item["currency"]: item for item in (await client.get("/v1/investments/allocation")).json()["items"]}

    sek = items["SEK"]
    assert sek["total"] == 1_000_000
    assert [(s["key"], s["value"], s["share"]) for s in sek["by_asset_type"]] == [
      ("stock", 250_000, 0.25),
      ("mutual_fund", 500_000, 0.5),
      ("cash", 250_000, 0.25),
    ]
    assert [(s["label"], s["value"]) for s in sek["by_account"]] == [("ISK", 750_000), ("KF", 200_000)]
    assert sek["borrowed"] == -50_000
    assert [(s["key"], s["value"]) for s in items["EUR"]["by_asset_type"]] == [("stock", 10_000)]
