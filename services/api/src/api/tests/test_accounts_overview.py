from datetime import date, timedelta
from uuid import uuid4

import pytest
from api.common.encryption import encrypt
from api.common.utils import utc_now
from api.models.avanza import AvanzaAccount, AvanzaConnection, HoldingSnapshot
from api.models.bank_account import BankAccount
from api.models.bank_connection import BankConnection, BankConnectionAccount
from api.models.import_batch import ImportBatch
from api.models.klarna import KlarnaPayLater
from api.models.montrose import MontroseAccount, MontroseConnection
from api.models.raw_transaction import RawTransaction
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

  async def account(
    self, name: str, *, subtype: str = "checking", base: int = 0, business: bool = False, counted: bool = True, currency: str = "SEK"
  ) -> BankAccount:
    account = BankAccount(
      name=name,
      currency=currency,
      base_balance=base,
      subtype=subtype,
      is_business=business,
      include_in_net_worth=counted,
      user_id=self.user.id,
    )
    await self.save_fixture(account)
    return account

  async def add(
    self, account: BankAccount, day: date, amount: int, direction: TransactionDirection = TransactionDirection.credit, *, kind: str | None = None
  ) -> None:
    await self.save_fixture(
      Transaction(
        amount=amount,
        currency=account.currency,
        transaction_date=day,
        direction=direction,
        dedup_hash=uuid4().hex,
        description="x",
        transaction_type=kind,
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
  async def test_an_account_left_out_of_net_worth_is_listed_but_not_counted(self, client: AsyncClient, accounts: _Accounts) -> None:
    await accounts.account("Skandia", base=100000)
    await accounts.account("Held for mum", base=50000, counted=False)

    overview = await _overview(client)

    assert {a["name"]: a["include_in_net_worth"] for a in overview["accounts"]} == {"Skandia": True, "Held for mum": False}
    assert [(t["cash"], t["net"]) for t in overview["totals"]] == [(100000, 100000)]

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
    company = await accounts.account("Company bank", business=True)
    await accounts.add(company, now.date() - timedelta(days=60), 100)
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
    problems = {name: a["source"]["issue"] and a["source"]["issue"]["kind"] for name, a in by_name.items()}

    assert {name: (a["source"]["kind"], a["source"]["label"]) for name, a in by_name.items()} == {
      "Skandia": ("bank", "Skandia"),
      "Avanza AF": ("avanza", "Avanza"),
      "Klarna Pay later": ("klarna", "Klarna pay later"),
      "Marginalen": ("manual", "Imported by hand"),
      "Empty": ("manual", "Imported by hand"),
      "Company bank": ("manual", "Imported by hand"),
    }
    assert problems == {
      "Skandia": "balance_mismatch",
      "Avanza AF": "stale",
      "Klarna Pay later": None,
      "Marginalen": "import_due",
      "Company bank": "import_due",
      "Empty": "no_transactions",
    }
    assert by_name["Skandia"]["source"]["issue"]["source_balance"] == 52361
    assert (by_name["Skandia"]["bank_balance"], by_name["Skandia"]["balance_drift"]) == (52361, -500)
    assert by_name["Avanza AF"]["source"]["issue"]["day"] == (now - timedelta(days=3)).date().isoformat()
    assert by_name["Avanza AF"]["bank_balance"] == 8635
    assert by_name["Klarna Pay later"]["bank_balance"] == -10900
    assert by_name["Marginalen"]["source"]["issue"]["day"] == (now.date() - timedelta(days=60)).isoformat()
    assert {name: a["source"]["logo"] for name, a in by_name.items() if a["source"]["logo"]} == {
      "Skandia": "https://enablebanking.com/brands/SE/Skandia/",
      "Klarna Pay later": "https://enablebanking.com/brands/SE/Klarna/",
    }
    assert by_name["Skandia"]["source"]["access_until"] is not None
    # App versions from before `issue` show these words as they are.
    assert {name: a["source"]["problem"] for name, a in by_name.items()} == {
      "Skandia": "Skandia says 523.61 SEK, Bessel 528.61 SEK.",
      "Avanza AF": f"Hasn't synced since {now - timedelta(days=3):%-d %b}.",
      "Klarna Pay later": None,
      "Marginalen": f"Imported by hand, nothing since {now.date() - timedelta(days=60):%-d %b %Y}. Import the latest export, or connect the bank.",
      "Company bank": f"Imported by hand, nothing since {now.date() - timedelta(days=60):%-d %b %Y}. Import the latest export.",
      "Empty": "No transactions yet. Import an export, or connect the bank.",
    }
    assert by_name["Marginalen"]["source"]["access_until"] is None

  @pytest.mark.asyncio
  @pytest.mark.parametrize(
    ("sync_error", "shared", "synced_ago", "valid_for", "kind"),
    [
      ("The bank is down.", True, timedelta(0), timedelta(days=100), "sync_failed"),
      (None, False, timedelta(0), timedelta(days=100), "not_shared"),
      (None, True, timedelta(days=3), timedelta(days=100), "stale"),
      (None, True, timedelta(0), timedelta(days=5), "renew_soon"),
    ],
  )
  async def test_a_connected_bank_says_what_is_wrong(
    self,
    client: AsyncClient,
    save_fixture: SaveFixture,
    user: User,
    accounts: _Accounts,
    sync_error: str | None,
    shared: bool,
    synced_ago: timedelta,
    valid_for: timedelta,
    kind: str,
  ) -> None:
    now = utc_now()
    skandia = await accounts.account("Skandia")
    connection = BankConnection(
      user_id=user.id,
      bank_name="Skandia",
      bank_country="SE",
      encrypted_session_id=encrypt("s"),
      valid_until=now + valid_for,
      last_synced_at=now - synced_ago,
      sync_error=sync_error,
    )
    await save_fixture(connection)
    await save_fixture(
      BankConnectionAccount(connection_id=connection.id, identification_hash="h", uid="u", currency="SEK", bank_account_id=skandia.id, shared=shared)
    )

    [account] = (await _overview(client))["accounts"]

    assert account["source"]["issue"]["kind"] == kind
    assert account["source"]["issue"]["detail"] == sync_error

  @pytest.mark.asyncio
  async def test_an_account_imported_by_hand_knows_the_bank_of_its_newest_file(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, accounts: _Accounts
  ) -> None:
    today = utc_now().date()
    savings = await accounts.account("Buffert")
    for bank, day in (("skandiabanken", today - timedelta(days=9)), ("marginalen", today - timedelta(days=2))):
      batch = ImportBatch(bank_name=bank, file_format="csv", raw_content="", row_count=1, user_id=user.id)
      await save_fixture(batch)
      raw = RawTransaction(row_number=1, raw_data={}, batch_id=batch.id)
      await save_fixture(raw)
      await save_fixture(
        Transaction(
          amount=100,
          currency="SEK",
          transaction_date=day,
          direction=TransactionDirection.credit,
          dedup_hash=uuid4().hex,
          bank_account_id=savings.id,
          user_id=user.id,
          raw_id=raw.id,
        )
      )

    [account] = (await _overview(client))["accounts"]

    assert (account["source"]["import_bank"], account["source"]["logo"]) == ("marginalen", "https://enablebanking.com/brands/SE/Marginalen%20Bank/")

  @pytest.mark.asyncio
  async def test_a_rejected_avanza_login_asks_to_sign_in_again(self, client: AsyncClient, save_fixture: SaveFixture, user: User, accounts: _Accounts) -> None:
    isk = await accounts.account("ISK", subtype="isk")
    avanza = AvanzaConnection(
      user_id=user.id, username="simon", encrypted_credentials=encrypt("{}"), last_synced_at=utc_now(), credentials_rejected_at=utc_now(), sync_error="x"
    )
    await save_fixture(avanza)
    await save_fixture(AvanzaAccount(connection_id=avanza.id, external_id="1", name="ISK", account_type="ISK", bank_account_id=isk.id))

    [account] = (await _overview(client))["accounts"]

    assert account["source"]["issue"]["kind"] == "sign_in"

  @pytest.mark.asyncio
  async def test_montrose_accounts_name_their_source_and_ask_for_bankid_when_the_consent_ends(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, accounts: _Accounts
  ) -> None:
    isk = await accounts.account("Montrose ISK", subtype="isk")
    kf = await accounts.account("Montrose KF", subtype="kf")
    consented = utc_now() - timedelta(days=80)
    montrose = MontroseConnection(
      user_id=user.id,
      encrypted_client=encrypt("{}"),
      encrypted_tokens=encrypt("{}"),
      access_expires_at=utc_now(),
      consented_at=consented,
      last_synced_at=utc_now(),
    )
    await save_fixture(montrose)
    await save_fixture(MontroseAccount(connection_id=montrose.id, external_id="a", account_number="1", name="ISK", account_type="ISK", bank_account_id=isk.id))
    await save_fixture(MontroseAccount(connection_id=montrose.id, external_id="b", account_number="2", name="KF", account_type="KF", bank_account_id=kf.id))

    ending = {a["name"]: a["source"] for a in (await _overview(client))["accounts"]}
    montrose.rejected_at = utc_now()
    await save_fixture(montrose)
    rejected = {a["name"]: a["source"] for a in (await _overview(client))["accounts"]}

    assert (ending["Montrose ISK"]["kind"], ending["Montrose ISK"]["label"]) == ("montrose", "Montrose")
    assert ending["Montrose ISK"]["logo"].startswith("https://cdn.prod.website-files.com/")
    assert ending["Montrose KF"]["issue"]["kind"] == "renew_soon"
    assert ending["Montrose KF"]["issue"]["day"] == (consented + timedelta(days=90)).date().isoformat()
    assert rejected["Montrose ISK"]["issue"]["kind"] == "sign_in"
    assert rejected["Montrose ISK"]["problem"] == "Montrose needs a new BankID login to keep syncing."

  @pytest.mark.asyncio
  async def test_pay_later_owing_more_than_klarna_says_is_flagged(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, accounts: _Accounts
  ) -> None:
    pay_later = await accounts.account("Klarna Pay later", subtype="credit_card")
    await save_fixture(KlarnaPayLater(user_id=user.id, bank_account_id=pay_later.id, owed=10900, balance_drift=5000, last_imported_at=utc_now()))

    [account] = (await _overview(client))["accounts"]

    assert account["source"]["issue"] == {"kind": "balance_mismatch", "day": None, "source_balance": -10900, "detail": None}
    assert account["source"]["problem"] == "Doesn't match what Klarna says is owed, 109.00 SEK. Import again."
    assert account["balance_drift"] == 5000


async def _history(client: AsyncClient) -> dict[str, list[tuple[str, int]]]:
  response = await client.get("/v1/bank-accounts/net-worth")
  assert response.status_code == 200
  return {series["currency"]: [(p["day"], p["value"]) for p in series["points"]] for series in response.json()["series"]}


class TestNetWorthHistory:
  @pytest.mark.asyncio
  async def test_steps_on_each_day_net_worth_changes_and_ends_today(self, client: AsyncClient, accounts: _Accounts) -> None:
    today = utc_now().date()
    first, second = today - timedelta(days=10), today - timedelta(days=4)
    checking = await accounts.account("Skandia", base=1000)
    company = await accounts.account("Company", base=5000, business=True)
    await accounts.add(checking, first, 500)
    await accounts.add(company, first, 500, TransactionDirection.debit)
    await accounts.add(checking, second, 200, TransactionDirection.debit)

    assert await _history(client) == {
      "SEK": [(first.isoformat(), 6000), (second.isoformat(), 5800), (today.isoformat(), 5800)],
    }

  @pytest.mark.asyncio
  async def test_before_the_first_snapshot_what_was_put_in_is_scaled_to_join_it(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, accounts: _Accounts
  ) -> None:
    today = utc_now().date()
    deposited, bought, snapshot = today - timedelta(days=30), today - timedelta(days=29), today - timedelta(days=2)
    isk = await accounts.account("ISK", subtype="isk")
    await accounts.add(isk, deposited, 10000, kind="DEPOSIT")
    await accounts.add(isk, bought, 9000, TransactionDirection.debit, kind="BUY")
    security = Security(name="Fund", asset_type=AssetType.mutual_fund, currency="SEK", isin="SE0000000001")
    await save_fixture(security)
    await save_fixture(
      HoldingSnapshot(
        user_id=user.id,
        bank_account_id=isk.id,
        security_id=security.id,
        snapshot_date=snapshot,
        quantity=1_000_000,
        value=9500,
        acquired_value=9000,
        currency="SEK",
      )
    )

    assert await _history(client) == {
      "SEK": [(deposited.isoformat(), 10500), (today.isoformat(), 10500)],
    }

  @pytest.mark.asyncio
  async def test_an_account_with_more_taken_out_than_put_in_counts_nothing_before_its_first_snapshot(
    self, client: AsyncClient, save_fixture: SaveFixture, user: User, accounts: _Accounts
  ) -> None:
    today = utc_now().date()
    deposited, withdrew, snapshot = today - timedelta(days=30), today - timedelta(days=20), today - timedelta(days=2)
    af = await accounts.account("AF", subtype="af")
    await accounts.add(af, deposited, 10000, kind="DEPOSIT")
    await accounts.add(af, withdrew, 15000, TransactionDirection.debit, kind="WITHDRAW")
    await accounts.add(af, withdrew, 5100, kind="SELL")
    security = Security(name="Fund", asset_type=AssetType.mutual_fund, currency="SEK", isin="SE0000000002")
    await save_fixture(security)
    await save_fixture(
      HoldingSnapshot(
        user_id=user.id,
        bank_account_id=af.id,
        security_id=security.id,
        snapshot_date=snapshot,
        quantity=1_000_000,
        value=0,
        acquired_value=0,
        currency="SEK",
      )
    )

    assert await _history(client) == {
      "SEK": [(deposited.isoformat(), 10000), (withdrew.isoformat(), 0), (snapshot.isoformat(), 100), (today.isoformat(), 100)],
    }

  @pytest.mark.asyncio
  async def test_debt_counts_but_a_card_in_credit_does_not(self, client: AsyncClient, accounts: _Accounts) -> None:
    today = utc_now().date()
    paid, bought = today - timedelta(days=6), today - timedelta(days=3)
    pay_later = await accounts.account("Klarna", subtype="credit_card")
    await accounts.add(pay_later, paid, 3000)
    await accounts.add(pay_later, bought, 4000, TransactionDirection.debit)

    assert await _history(client) == {"SEK": [(paid.isoformat(), 0), (bought.isoformat(), -1000), (today.isoformat(), -1000)]}

  @pytest.mark.asyncio
  async def test_each_currency_alone_and_accounts_left_out_are_not_counted(self, client: AsyncClient, accounts: _Accounts) -> None:
    today = utc_now().date()
    await accounts.account("Skandia", base=1000)
    await accounts.account("Held for mum", base=50000, counted=False)
    revolut = await accounts.account("Revolut", currency="EUR")
    await accounts.add(revolut, today - timedelta(days=1), 300)

    assert await _history(client) == {
      "EUR": [((today - timedelta(days=1)).isoformat(), 300), (today.isoformat(), 300)],
      "SEK": [(today.isoformat(), 1000)],
    }

  @pytest.mark.asyncio
  async def test_another_users_accounts_are_not_in_it(self, other_client: AsyncClient, accounts: _Accounts) -> None:
    await accounts.account("Skandia", base=100000)

    assert await _history(other_client) == {}
