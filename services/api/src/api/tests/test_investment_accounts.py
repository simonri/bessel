from datetime import date
from uuid import uuid4

import pytest
from api.common.utils import utc_now
from api.models.avanza import AvanzaAccount, AvanzaConnection, HoldingSnapshot
from api.models.bank_account import BankAccount
from api.models.security import AssetType, Security
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient

DEBIT, CREDIT = TransactionDirection.debit, TransactionDirection.credit


async def _account(save_fixture: SaveFixture, user: User, name: str, subtype: str, *, business: bool = False) -> BankAccount:
  account = BankAccount(name=name, currency="SEK", base_balance=0, subtype=subtype, is_business=business, user_id=user.id)
  await save_fixture(account)
  return account


async def _move(save_fixture: SaveFixture, account: BankAccount, day: date, amount: int, direction: TransactionDirection, kind: str) -> None:
  await save_fixture(
    Transaction(
      amount=amount,
      currency="SEK",
      transaction_date=day,
      direction=direction,
      dedup_hash=uuid4().hex,
      description=kind.title(),
      transaction_type=kind,
      bank_account_id=account.id,
      user_id=account.user_id,
    )
  )


async def _snapshot(save_fixture: SaveFixture, account: BankAccount, security: Security, value: int, acquired: int) -> None:
  await save_fixture(
    HoldingSnapshot(
      user_id=account.user_id,
      bank_account_id=account.id,
      security_id=security.id,
      snapshot_date=utc_now().date(),
      quantity=1_000_000,
      value=value,
      acquired_value=acquired,
      currency="SEK",
    )
  )


class TestInvestmentAccounts:
  @pytest.mark.asyncio
  async def test_what_each_account_is_worth_what_went_in_and_what_it_made(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    af = await _account(save_fixture, user, "Avanza AF", "af")
    await _account(save_fixture, user, "Skandia", "checking")
    fund = Security(name="Global fund", asset_type=AssetType.mutual_fund, currency="SEK", isin="SE0000000002")
    await save_fixture(fund)
    await _move(save_fixture, af, date(2025, 3, 1), 1000000, CREDIT, "DEPOSIT")
    await _move(save_fixture, af, date(2025, 4, 1), 500000, DEBIT, "BUY")
    await _move(save_fixture, af, date(2025, 6, 1), 11100, CREDIT, "DIVIDEND")
    await _move(save_fixture, af, date(2026, 2, 1), 200000, DEBIT, "WITHDRAW")
    await _move(save_fixture, af, date(2026, 6, 1), 5000, CREDIT, "DIVIDEND")
    await _snapshot(save_fixture, af, fund, 600000, 500000)

    [summary] = (await client.get("/v1/investments/accounts")).json()["items"]

    assert {k: summary[k] for k in ("name", "holdings_value", "cash", "total", "acquired_value", "deposits", "withdrawals", "net_deposits", "growth")} == {
      "name": "Avanza AF",
      "holdings_value": 600000,
      "cash": 316100,
      "total": 916100,
      "acquired_value": 500000,
      "deposits": 1000000,
      "withdrawals": 200000,
      "net_deposits": 800000,
      "growth": 116100,
    }
    assert summary["dividends"] == [{"year": 2026, "amount": 5000}, {"year": 2025, "amount": 11100}]
    assert summary["first_transaction"] == "2025-03-01"

  @pytest.mark.asyncio
  async def test_a_fund_in_two_accounts_stays_two_holdings(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    af, kf = await _account(save_fixture, user, "AF", "af"), await _account(save_fixture, user, "KF", "kf", business=True)
    fund = Security(name="Global fund", asset_type=AssetType.mutual_fund, currency="SEK", isin="SE0000000003")
    await save_fixture(fund)
    await _snapshot(save_fixture, af, fund, 100000, 90000)
    await _snapshot(save_fixture, kf, fund, 300000, 250000)
    avanza = AvanzaConnection(user_id=user.id, username="simon", encrypted_credentials="unused")
    await save_fixture(avanza)
    for external_id, account in (("1", af), ("2", kf)):
      await save_fixture(AvanzaAccount(connection_id=avanza.id, external_id=external_id, name=account.name, account_type="X", bank_account_id=account.id))

    holdings = (await client.get("/v1/investments/holdings")).json()["items"]
    summaries = {s["name"]: (s["is_business"], s["holdings_value"]) for s in (await client.get("/v1/investments/accounts")).json()["items"]}

    assert sorted((h["bank_account_id"], h["current_value"]) for h in holdings) == sorted([(str(af.id), 100000), (str(kf.id), 300000)])
    assert summaries == {"AF": (False, 100000), "KF": (True, 300000)}

  @pytest.mark.asyncio
  async def test_another_users_accounts_are_not_in_it(self, other_client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    await _account(save_fixture, user, "Avanza AF", "af")

    assert (await other_client.get("/v1/investments/accounts")).json()["items"] == []
