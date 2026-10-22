from datetime import date, timedelta
from uuid import uuid4

import pytest
from api.common.encryption import encrypt
from api.common.utils import utc_now
from api.models.avanza import AvanzaAccount, AvanzaConnection, HoldingSnapshot
from api.models.bank_account import BankAccount
from api.models.bank_connection import BankConnection, BankConnectionAccount
from api.models.klarna import KlarnaPayLater
from api.models.security import AssetType, Security
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.settings import settings
from api.tests.fixtures.database import SaveFixture
from cryptography.fernet import Fernet
from httpx import AsyncClient


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())


class _Accounts:
  def __init__(self, save_fixture: SaveFixture, user: User) -> None:
    self.save_fixture, self.user = save_fixture, user

  async def account(self, name: str, *, subtype: str = "checking", base: int = 0, business: bool = False) -> BankAccount:
    account = BankAccount(name=name, currency="SEK", base_balance=base, subtype=subtype, is_business=business, user_id=self.user.id)
    await self.save_fixture(account)
    return account

  async def add(self, account: BankAccount, day: date, amount: int, direction: TransactionDirection = TransactionDirection.credit) -> None:
    await self.save_fixture(
      Transaction(
        amount=amount,
        currency="SEK",
        transaction_date=day,
        direction=direction,
        dedup_hash=uuid4().hex,
        description="x",
        bank_account_id=account.id,
        user_id=self.user.id,
      )
    )


@pytest.fixture
def accounts(save_fixture: SaveFixture, user: User) -> _Accounts:
  return _Accounts(save_fixture, user)


async def _overview(client: AsyncClient) -> dict:
  response = await client.get("/v1/bank-accounts/overview")
  assert response.status_code == 200
  return response.json()


class TestTotals:
  @pytest.mark.asyncio
  async def test_net_worth_is_per_owner_and_counts_holdings_and_debt(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, accounts: _Accounts
  ) -> None:
    today = utc_now().date()
    await accounts.account("Skandia", base=100000)
    isk = await accounts.account("Avanza", subtype="isk", base=20000)
    pay_later = await accounts.account("Klarna Pay later", subtype="credit_card")
    await accounts.account("Marginalen", base=300000, business=True)
    await accounts.add(pay_later, today, 10900, TransactionDirection.debit)
    security = Security(name="Fund", asset_type=AssetType.mutual_fund, currency="SEK", isin="SE0000000001")
    await save_fixture(security)
    await save_fixture(
      HoldingSnapshot(
        user_id=user.id,
        bank_account_id=isk.id,
        security_id=security.id,
        snapshot_date=today,
        quantity=1_000_000,
        value=500000,
        acquired_value=400000,
        currency="SEK",
      )
    )

    overview = await _overview(client)

    by_name = {a["name"]: a for a in overview["accounts"]}
    assert [(by_name[n]["group"], by_name[n]["current_balance"]) for n in ("Skandia", "Avanza", "Klarna Pay later")] == [
      ("cash", 100000),
      ("investments", 20000),
      ("credit", -10900),
    ]
    assert (by_name["Avanza"]["holdings_value"], by_name["Skandia"]["holdings_value"]) == (500000, None)
    assert [(t["owner"], t["cash"], t["investments"], t["debt"], t["net"]) for t in overview["totals"]] == [
      ("personal", 100000, 520000, 10900, 609100),
      ("company", 300000, 0, 0, 300000),
    ]
    assert by_name["Marginalen"]["is_business"] is True

  @pytest.mark.asyncio
  async def test_another_users_accounts_are_not_in_it(self, other_client: AsyncClient, accounts: _Accounts) -> None:
    await accounts.account("Skandia", base=100000)

    assert await _overview(other_client) == {"accounts": [], "totals": []}


class TestHistory:
  @pytest.mark.asyncio
  async def test_month_end_balances_start_with_the_first_transaction(self, client: AsyncClient, accounts: _Accounts) -> None:
    today = utc_now().date().replace(day=1)
    checking = await accounts.account("Skandia", base=1000)
    two_months_ago = (today - timedelta(days=40)).replace(day=1)
    await accounts.add(checking, two_months_ago, 500)
    await accounts.add(checking, today, 200, TransactionDirection.debit)

    [account] = (await _overview(client))["accounts"]

    assert [p["balance"] for p in account["history"]] == [1500, 1500, 1300]
    assert account["history"][0]["month"] == two_months_ago.isoformat()
    assert (account["first_transaction"], account["transaction_count"]) == (two_months_ago.isoformat(), 2)

  @pytest.mark.asyncio
  async def test_history_shows_at_most_a_year(self, client: AsyncClient, accounts: _Accounts) -> None:
    checking = await accounts.account("Skandia")
    await accounts.add(checking, utc_now().date() - timedelta(days=800), 100)

    [account] = (await _overview(client))["accounts"]

    assert len(account["history"]) == 12 and account["history"][-1]["balance"] == 100


class TestSources:
  @pytest.mark.asyncio
  async def test_each_account_says_where_its_data_comes_from_and_what_needs_attention(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, accounts: _Accounts
  ) -> None:
    now = utc_now()
    skandia, avanza_af = await accounts.account("Skandia"), await accounts.account("Avanza AF", subtype="af")
    pay_later, marginalen = await accounts.account("Klarna Pay later", subtype="credit_card"), await accounts.account("Marginalen")
    await accounts.account("Empty")
    await accounts.add(marginalen, now.date() - timedelta(days=60), 100)
    connection = BankConnection(
      user_id=user.id, bank_name="Skandia", bank_country="SE", encrypted_session_id=encrypt("s"), valid_until=now + timedelta(days=100), last_synced_at=now
    )
    await save_fixture(connection)
    await save_fixture(
      BankConnectionAccount(
        connection_id=connection.id, identification_hash="h", uid="u", currency="SEK", bank_account_id=skandia.id, bank_balance=52361, balance_drift=-500
      )
    )
    avanza = AvanzaConnection(user_id=user.id, username="simon", encrypted_credentials=encrypt("{}"), last_synced_at=now - timedelta(days=3))
    await save_fixture(avanza)
    await save_fixture(
      AvanzaAccount(connection_id=avanza.id, external_id="1", name="AF", account_type="AKTIEFONDKONTO", bank_account_id=avanza_af.id, cash_balance=8635)
    )
    await save_fixture(KlarnaPayLater(user_id=user.id, bank_account_id=pay_later.id, owed=10900, balance_drift=0, last_imported_at=now))

    by_name = {a["name"]: a for a in (await _overview(client))["accounts"]}

    assert {name: (a["source"]["kind"], a["source"]["label"]) for name, a in by_name.items()} == {
      "Skandia": ("bank", "Skandia"),
      "Avanza AF": ("avanza", "Avanza"),
      "Klarna Pay later": ("klarna", "Klarna pay later"),
      "Marginalen": ("manual", "Imported by hand"),
      "Empty": ("manual", "Imported by hand"),
    }
    assert by_name["Skandia"]["source"]["problem"] == "Skandia says 523.61 SEK, Bessel 528.61 SEK."
    assert (by_name["Skandia"]["bank_balance"], by_name["Skandia"]["balance_drift"]) == (52361, -500)
    assert by_name["Avanza AF"]["source"]["problem"].startswith("Hasn't synced since")
    assert by_name["Avanza AF"]["bank_balance"] == 8635
    assert (by_name["Klarna Pay later"]["source"]["problem"], by_name["Klarna Pay later"]["bank_balance"]) == (None, -10900)
    assert by_name["Marginalen"]["source"]["problem"].startswith("Imported by hand, nothing since")
    assert by_name["Empty"]["source"]["problem"] == "No transactions yet. Import an export, or connect the bank."

  @pytest.mark.asyncio
  async def test_pay_later_owing_more_than_klarna_says_is_flagged(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, accounts: _Accounts
  ) -> None:
    pay_later = await accounts.account("Klarna Pay later", subtype="credit_card")
    await save_fixture(KlarnaPayLater(user_id=user.id, bank_account_id=pay_later.id, owed=10900, balance_drift=5000, last_imported_at=utc_now()))

    [account] = (await _overview(client))["accounts"]

    assert account["source"]["problem"] == "Doesn't match what Klarna says is owed, 109.00 SEK. Import again."
    assert account["balance_drift"] == 5000
