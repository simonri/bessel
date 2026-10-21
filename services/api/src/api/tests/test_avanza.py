import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from api.avanza import client as avanza_client
from api.avanza import parsing, service
from api.avanza.repository import AvanzaConnectionRepository
from api.avanza.service import SessionMaker, avanza_service
from api.common.encryption import decrypt, encrypt
from api.models.avanza import AvanzaAccount, AvanzaConnection, HoldingSnapshot
from api.models.bank_account import BankAccount
from api.models.security import AssetType, Security
from api.models.trade import Trade, TradeType
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.settings import settings
from api.tests.avanza_fake import TOTP_SECRET, FakeAvanza, account, instrument, movement, position
from api.tests.fixtures.database import SaveFixture
from api.worker._enqueue import JobQueueManager
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select

NOW = datetime(2026, 10, 21, 16, 30, tzinfo=UTC)
TODAY = NOW.date()
MSTR = instrument("US5949724083", "Strategy A", currency="USD")
GLOBAL = instrument("SE0000000001", "Avanza Global", kind="FUND")
CONNECT = {"username": "simon", "password": "hunter2", "totp_secret": TOTP_SECRET.lower()[:16] + " " + TOTP_SECRET.lower()[16:]}


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture(autouse=True)
def frozen_now(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(service, "utc_now", lambda: NOW)


@pytest.fixture(autouse=True)
def no_waiting(monkeypatch: pytest.MonkeyPatch) -> None:
  async def instantly() -> None:
    return None

  monkeypatch.setattr(avanza_client, "wait_for_next_code", instantly)


@pytest.fixture
def avanza(monkeypatch: pytest.MonkeyPatch) -> FakeAvanza:
  fake = FakeAvanza(accounts=[account("111", name="ISK", cash=250.5), account("222", "KAPITALFORSAKRING", name="KF")])
  monkeypatch.setattr(avanza_client, "http_client", lambda: httpx.AsyncClient(base_url=avanza_client.BASE_URL, transport=fake.transport()))
  return fake


@pytest.fixture
def allowed(monkeypatch: pytest.MonkeyPatch, user: User) -> None:
  monkeypatch.setattr(settings, "AVANZA_USER_IDS", [user.id])


@pytest.fixture
def session_maker(session: AsyncSession) -> SessionMaker:
  @asynccontextmanager
  async def maker() -> AsyncIterator[AsyncSession]:
    yield session
    await session.flush()

  return maker


async def _bank_account(save_fixture: SaveFixture, user_id: UUID, name: str = "Avanza ISK", subtype: str = "isk") -> BankAccount:
  bank_account = BankAccount(name=name, currency="SEK", base_balance=0, subtype=subtype, user_id=user_id)
  await save_fixture(bank_account)
  return bank_account


async def _connection(
  save_fixture: SaveFixture, user_id: UUID, *, linked: BankAccount | None = None, last_synced_at: datetime | None = None
) -> AvanzaConnection:
  connection = AvanzaConnection(
    user_id=user_id, username="simon", encrypted_credentials=encrypt(json.dumps({"password": "hunter2", "totpSecret": TOTP_SECRET}))
  )
  await save_fixture(connection)
  await save_fixture(
    AvanzaAccount(
      connection_id=connection.id,
      external_id="111",
      name="ISK",
      account_type="INVESTERINGSSPARKONTO",
      bank_account_id=linked.id if linked else None,
      last_synced_at=last_synced_at,
    )
  )
  return connection


async def _cash(session: AsyncSession, bank_account: BankAccount) -> list[tuple[date, int, TransactionDirection, str | None]]:
  rows = await session.execute(
    select(Transaction.transaction_date, Transaction.amount, Transaction.direction, Transaction.description)
    .where(Transaction.bank_account_id == bank_account.id)
    .order_by(Transaction.transaction_date, Transaction.amount)
  )
  return [tuple(row) for row in rows]  # type: ignore[misc]


async def _trades(session: AsyncSession, bank_account: BankAccount) -> list[tuple[TradeType, date, int, int, str, str | None]]:
  rows = await session.execute(
    select(Trade.trade_type, Trade.trade_date, Trade.quantity, Trade.price_per_unit, Trade.currency, Trade.notes)
    .where(Trade.bank_account_id == bank_account.id)
    .order_by(Trade.trade_date)
  )
  return [tuple(row) for row in rows]  # type: ignore[misc]


class TestConnect:
  @pytest.mark.asyncio
  async def test_only_listed_users_can_connect(self, client: AsyncClient, avanza: FakeAvanza, user: User, monkeypatch: pytest.MonkeyPatch) -> None:
    assert (await client.get("/v1/avanza")).json() == {"available": False, "connection": None}
    assert (await client.post("/v1/avanza/connect", json=CONNECT)).status_code == 403
    assert avanza.logins == 0

    monkeypatch.setattr(settings, "AVANZA_USER_IDS", [user.id])
    assert (await client.get("/v1/avanza")).json()["available"] is True

  @pytest.mark.asyncio
  async def test_connecting_checks_the_login_and_keeps_it_encrypted(
    self, client: AsyncClient, session: AsyncSession, allowed: None, avanza: FakeAvanza, user: User
  ) -> None:
    response = await client.post("/v1/avanza/connect", json=CONNECT)

    assert response.status_code == 201
    body = response.json()
    assert [(a["name"], a["account_type"], a["cash_balance"], a["bank_account_id"]) for a in body["accounts"]] == [
      ("ISK", "INVESTERINGSSPARKONTO", 25050, None),
      ("KF", "KAPITALFORSAKRING", 0, None),
    ]
    assert "hunter2" not in response.text and TOTP_SECRET not in response.text.upper()
    connection = (await session.execute(select(AvanzaConnection))).scalar_one()
    assert "hunter2" not in connection.encrypted_credentials
    # Spaces and lower case, as Avanza shows the secret, are cleaned up before use.
    assert json.loads(decrypt(connection.encrypted_credentials)) == {"password": "hunter2", "totpSecret": TOTP_SECRET}
    assert avanza.logins == 1

  @pytest.mark.asyncio
  async def test_a_wrong_password_or_secret_stores_nothing(self, client: AsyncClient, session: AsyncSession, allowed: None, avanza: FakeAvanza) -> None:
    wrong_password = await client.post("/v1/avanza/connect", json={**CONNECT, "password": "wrong"})
    wrong_secret = await client.post("/v1/avanza/connect", json={**CONNECT, "totp_secret": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"})
    not_base32 = await client.post("/v1/avanza/connect", json={**CONNECT, "totp_secret": "not a base32 secret!!"})

    assert (wrong_password.status_code, wrong_password.json()["detail"]) == (400, "Avanza didn't accept the username or password.")
    assert (wrong_secret.status_code, wrong_secret.json()["detail"]) == (400, "Avanza didn't accept the code from the TOTP secret.")
    assert (not_base32.status_code, not_base32.json()["detail"]) == (400, "The TOTP secret isn't valid.")
    assert (await session.execute(select(AvanzaConnection))).scalars().all() == []

  @pytest.mark.asyncio
  async def test_a_code_avanza_just_saw_is_retried_with_the_next_one(self, client: AsyncClient, allowed: None, avanza: FakeAvanza) -> None:
    avanza.reject_codes = 1

    assert (await client.post("/v1/avanza/connect", json=CONNECT)).status_code == 201
    assert avanza.logins == 1

  @pytest.mark.asyncio
  async def test_saving_new_credentials_resumes_syncing_and_keeps_links(
    self,
    client: AsyncClient,
    session: AsyncSession,
    save_fixture: SaveFixture,
    allowed: None,
    avanza: FakeAvanza,
    user: User,
    job_queue_manager: JobQueueManager,
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, linked=bank_account)
    connection.credentials_rejected_at, connection.sync_error = NOW, service.REJECTED
    await session.flush()

    body = (await client.post("/v1/avanza/connect", json=CONNECT)).json()

    assert (body["credentials_rejected"], body["sync_error"]) == (False, None)
    assert [a["bank_account_id"] for a in body["accounts"]] == [str(bank_account.id), None]
    assert [job[:2] for job in job_queue_manager._enqueued_jobs] == [("sync_avanza_connection", (str(connection.id),))]


class TestLink:
  @pytest.mark.asyncio
  async def test_linking_queues_a_full_import_and_one_bessel_account_takes_one_avanza_account(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User, job_queue_manager: JobQueueManager
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, last_synced_at=NOW)
    await save_fixture(AvanzaAccount(connection_id=connection.id, external_id="222", name="KF", account_type="KAPITALFORSAKRING"))
    first, second = [a["id"] for a in (await client.get("/v1/avanza")).json()["connection"]["accounts"]]

    linked = await client.patch(f"/v1/avanza/accounts/{first}", json={"bank_account_id": str(bank_account.id)})
    taken = await client.patch(f"/v1/avanza/accounts/{second}", json={"bank_account_id": str(bank_account.id)})

    assert linked.status_code == 200
    assert linked.json()["accounts"][0]["bank_account_id"] == str(bank_account.id)
    assert taken.status_code == 409
    stored = await AvanzaConnectionRepository.from_session(session).get_with_accounts(connection.id)
    assert stored is not None and stored.accounts[0].last_synced_at is None
    assert [job[:2] for job in job_queue_manager._enqueued_jobs] == [("sync_avanza_connection", (str(connection.id),))]


class TestSync:
  @pytest.mark.asyncio
  async def test_imports_cash_trades_and_positions_for_linked_accounts(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, avanza: FakeAvanza, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, linked=bank_account)
    avanza.movements = [
      movement("m1", "111", "DEPOSIT", "2026-03-01", 10000.0, description="Insättning"),
      movement("m2", "111", "BUY", "2026-03-08", -3600.5, inst=MSTR, volume=1.0, price=342.15, price_unit="USD", commission=1.0, description="Köp Strategy A"),
      movement("m3", "111", "SELL", "2026-06-01", 500.0, inst=GLOBAL, volume=-2.5, price=200.0, description="Sälj Avanza Global"),
      movement("m4", "111", "DIVIDEND", "2026-06-15", 12.34, inst=MSTR, description="Utdelning"),
      movement("m5", "111", "BUY", TODAY.isoformat(), -99.0, inst=GLOBAL, volume=0.5, price=198.0, intraday=True),
      movement("k1", "222", "DEPOSIT", "2026-03-01", 777.0),
    ]
    avanza.positions = [
      position("111", MSTR, volume=1.0, value=3900.0, acquired=3601.5),
      position("222", GLOBAL, volume=4.0, value=800.0, acquired=700.0),
    ]

    await avanza_service.sync(session_maker, connection.id)

    assert await _cash(session, bank_account) == [
      (date(2026, 3, 1), 1000000, TransactionDirection.credit, "Insättning"),
      (date(2026, 3, 8), 360050, TransactionDirection.debit, "Köp Strategy A"),
      (date(2026, 6, 1), 50000, TransactionDirection.credit, "Sälj Avanza Global"),
      (date(2026, 6, 15), 1234, TransactionDirection.credit, "Utdelning"),
    ]
    assert await _trades(session, bank_account) == [
      (TradeType.buy, date(2026, 3, 8), 1_000_000, 34215, "USD", "Courtage 1.0 SEK"),
      (TradeType.sell, date(2026, 6, 1), 2_500_000, 20000, "SEK", None),
    ]
    security = (await session.execute(select(Security).where(Security.isin == MSTR["isin"]))).scalar_one()
    assert (security.name, security.asset_type, security.currency) == ("Strategy A", AssetType.stock, "USD")
    [snapshot] = (await session.execute(select(HoldingSnapshot).where(HoldingSnapshot.bank_account_id == bank_account.id))).scalars().all()
    assert (snapshot.snapshot_date, snapshot.quantity, snapshot.value, snapshot.acquired_value, snapshot.currency) == (TODAY, 1_000_000, 390000, 360150, "SEK")
    stored = await AvanzaConnectionRepository.from_session(session).get_with_accounts(connection.id)
    assert stored is not None
    assert (stored.last_synced_at, stored.sync_error, stored.accounts[0].last_synced_at, stored.accounts[0].cash_balance) == (NOW, None, NOW, 25050)

  @pytest.mark.asyncio
  async def test_syncing_again_imports_nothing_twice_and_reads_two_weeks_back(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, avanza: FakeAvanza, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, linked=bank_account)
    avanza.movements = [movement("m1", "111", "BUY", "2026-10-10", -100.0, inst=GLOBAL, volume=0.5, price=200.0)]
    avanza.positions = [position("111", GLOBAL, volume=0.5, value=101.0, acquired=100.0)]

    await avanza_service.sync(session_maker, connection.id)
    await avanza_service.sync(session_maker, connection.id)

    assert [r["from"] for r in avanza.transaction_requests] == ["2000-01-01", (TODAY - timedelta(days=14)).isoformat()]
    assert len(await _cash(session, bank_account)) == 1
    assert len(await _trades(session, bank_account)) == 1
    snapshots = (await session.execute(select(HoldingSnapshot))).scalars().all()
    assert len(snapshots) == 1

  @pytest.mark.asyncio
  async def test_a_full_page_is_split_until_every_transaction_is_read(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, avanza: FakeAvanza, user: User, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    monkeypatch.setattr(service, "PAGE_LIMIT", 2)
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, linked=bank_account)
    avanza.movements = [movement(f"m{i}", "111", "DEPOSIT", f"20{10 + i}-05-01", 10.0) for i in range(5)]

    await avanza_service.sync(session_maker, connection.id)

    assert len(await _cash(session, bank_account)) == 5

  @pytest.mark.asyncio
  async def test_a_rejected_login_stops_syncing_until_new_credentials(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, avanza: FakeAvanza, user: User
  ) -> None:
    connection = await _connection(save_fixture, user.id)
    avanza.password = "changed"

    await avanza_service.sync(session_maker, connection.id)
    stored = await AvanzaConnectionRepository.from_session(session).get_by_id(connection.id)
    assert stored is not None
    assert (stored.credentials_rejected_at, stored.sync_error) == (NOW, service.REJECTED)
    assert await AvanzaConnectionRepository.from_session(session).list_syncable_ids() == []

    avanza.password = "hunter2"
    await avanza_service.sync(session_maker, connection.id)
    assert avanza.logins == 0

  @pytest.mark.asyncio
  async def test_outages_are_recorded_without_avanzas_error_text(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, avanza: FakeAvanza, user: User
  ) -> None:
    connection = await _connection(save_fixture, user.id, linked=await _bank_account(save_fixture, user.id))
    avanza.fail_with = 500

    await avanza_service.sync(session_maker, connection.id)

    stored = await AvanzaConnectionRepository.from_session(session).get_by_id(connection.id)
    assert stored is not None
    assert (stored.sync_error, stored.credentials_rejected_at, stored.last_synced_at) == (service.UNREACHABLE, None, None)

  @pytest.mark.asyncio
  async def test_sync_now_waits_ten_minutes_after_the_last_sync(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User, job_queue_manager: JobQueueManager
  ) -> None:
    connection = await _connection(save_fixture, user.id, last_synced_at=NOW - timedelta(minutes=5))
    connection.last_synced_at = NOW - timedelta(minutes=5)
    await session.flush()
    with pytest.MonkeyPatch.context() as patch:
      patch.setattr("api.avanza.endpoints.utc_now", lambda: NOW)
      too_soon = await client.post("/v1/avanza/sync")
      patch.setattr("api.avanza.endpoints.utc_now", lambda: NOW + timedelta(minutes=6))
      later = await client.post("/v1/avanza/sync")

    assert too_soon.status_code == 429
    assert later.status_code == 202
    assert len(job_queue_manager._enqueued_jobs) == 1


class TestHoldings:
  @pytest.mark.asyncio
  async def test_synced_accounts_show_avanzas_positions_instead_of_adding_up_trades(
    self, client: AsyncClient, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, avanza: FakeAvanza, user: User
  ) -> None:
    synced, manual = await _bank_account(save_fixture, user.id), await _bank_account(save_fixture, user.id, "Nordnet", "brokerage")
    hand_entered = Security(name="Hand entered", asset_type=AssetType.stock, currency="SEK")
    await save_fixture(hand_entered)
    for bank_account in (synced, manual):
      await save_fixture(
        Trade(
          security_id=hand_entered.id,
          bank_account_id=bank_account.id,
          trade_type=TradeType.buy,
          trade_date=date(2026, 3, 8),
          quantity=3_000_000,
          price_per_unit=1000,
          currency="SEK",
          user_id=user.id,
        )
      )
    connection = await _connection(save_fixture, user.id, linked=synced)
    avanza.positions = [position("111", MSTR, volume=2.0, value=8000.0, acquired=7000.0)]
    await avanza_service.sync(session_maker, connection.id)

    holdings = {h["security_name"]: h for h in (await client.get("/v1/investments/holdings")).json()["items"]}

    assert holdings["Hand entered"]["quantity"] == 3_000_000
    strategy = holdings["Strategy A"]
    # Avanza values positions in the account's currency, so a US stock shows in SEK.
    assert (strategy["currency"], strategy["quantity"], strategy["current_value"], strategy["cost_basis"]) == ("SEK", 2_000_000, 800000, 700000)
    assert (strategy["current_price"], strategy["avg_cost_per_unit"], strategy["gain_loss"], strategy["gain_loss_pct"]) == (400000, 350000, 100000, 14.29)


class TestIsolation:
  @pytest.mark.asyncio
  async def test_other_users_cant_see_link_sync_or_disconnect(
    self, client: AsyncClient, other_client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, user: User, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    connection = await _connection(save_fixture, user.id)
    account_id = (await session.execute(select(AvanzaAccount.id).where(AvanzaAccount.connection_id == connection.id))).scalar_one()
    others = (await other_client.post("/v1/bank-accounts", json={"name": "B", "currency": "SEK", "subtype": "isk"})).json()
    other_id = (await session.execute(select(User.id).where(User.id != user.id))).scalar_one()
    monkeypatch.setattr(settings, "AVANZA_USER_IDS", [user.id, other_id])

    assert (await other_client.get("/v1/avanza")).json()["connection"] is None
    assert (await other_client.patch(f"/v1/avanza/accounts/{account_id}", json={"bank_account_id": others["id"]})).status_code == 404
    assert (await other_client.post("/v1/avanza/sync")).status_code == 404
    assert (await other_client.delete("/v1/avanza")).status_code == 404
    assert (await client.patch(f"/v1/avanza/accounts/{account_id}", json={"bank_account_id": others["id"]})).status_code == 404
    assert (await client.get("/v1/avanza")).json()["connection"]["accounts"][0]["bank_account_id"] is None


class TestDisconnect:
  @pytest.mark.asyncio
  async def test_disconnecting_deletes_the_login_and_keeps_imports(
    self, client: AsyncClient, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, avanza: FakeAvanza, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, linked=bank_account)
    avanza.movements = [movement("m1", "111", "DEPOSIT", "2026-03-01", 10.0)]
    await avanza_service.sync(session_maker, connection.id)

    assert (await client.delete("/v1/avanza")).status_code == 204

    assert (await session.execute(select(AvanzaConnection))).scalars().all() == []
    assert len(await _cash(session, bank_account)) == 1


class TestInvestmentAccountsInStats:
  @pytest.mark.asyncio
  async def test_investment_accounts_dont_count_as_income_or_spending(self, client: AsyncClient, save_fixture: SaveFixture, user: User) -> None:
    checking, isk = await _bank_account(save_fixture, user.id, "Checking", "checking"), await _bank_account(save_fixture, user.id)
    day = date.today().replace(day=1)
    for bank_account, amount, direction in (
      (checking, 1000, TransactionDirection.debit),
      (isk, 50000, TransactionDirection.debit),
      (isk, 70000, TransactionDirection.credit),
    ):
      await save_fixture(
        Transaction(
          amount=amount,
          currency="SEK",
          transaction_date=day,
          direction=direction,
          dedup_hash=uuid4().hex,
          bank_account_id=bank_account.id,
          user_id=user.id,
        )
      )

    [current] = [m for m in (await client.get("/v1/transactions/monthly-flow")).json()["items"] if m["month"] == day.month and m["year"] == day.year]

    assert (current["income"], current["expenses"]) == (0, 1000)


FIXTURES = Path(__file__).parent / "fixtures" / "avanza"


def _fixture(name: str) -> dict:
  return json.loads((FIXTURES / name).read_text())


class TestRealShapes:
  """Redacted copies of real Avanza responses: real shapes and field names, fake ids, amounts and names."""

  def test_parses_every_kind_of_row(self) -> None:
    accounts = parsing.accounts(_fixture("overview.json"))
    positions = parsing.positions(_fixture("positions.json"))
    movements = parsing.movements(_fixture("transactions.json"))

    assert [a.account_type for a in accounts] == ["AKTIEFONDKONTO", "KAPITALFORSAKRING", "KAPITALFORSAKRING"]
    # Funds and delisted holdings come without an order book.
    assert len(positions) == 3 and {p.currency for p in positions} == {"SEK"}
    buys = [m for m in movements if m.type == "BUY"]
    assert buys and all(m.amount < 0 and m.quantity and m.quantity > 0 and m.instrument for m in buys)
    assert all(m.description == f"Köp {m.instrument.name}" for m in buys if m.instrument)
    sells = [m for m in movements if m.type == "SELL"]
    assert sells and all(m.amount > 0 and m.quantity and m.quantity < 0 for m in sells)
    assert {m.price_currency for m in buys + sells} >= {"SEK", "USD"}
    interest = [m for m in movements if m.type == "INTEREST"]
    assert interest and all(m.description in ("Utlåningsränta", "Inlåningsränta") for m in interest)
    # Corporate actions move shares but no cash.
    assert any(m.type == "INSTRUMENT_TRANSFER" and m.amount == 0 for m in movements)

  @pytest.mark.asyncio
  async def test_each_accounts_imported_history_adds_up_to_avanzas_cash(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, avanza: FakeAvanza, user: User
  ) -> None:
    overview = _fixture("overview.json")
    avanza.accounts = overview["accounts"]
    avanza.positions_body = _fixture("positions.json")
    avanza.movements = _fixture("transactions.json")["transactions"]
    connection = AvanzaConnection(
      user_id=user.id, username="simon", encrypted_credentials=encrypt(json.dumps({"password": "hunter2", "totpSecret": TOTP_SECRET}))
    )
    await save_fixture(connection)
    bank_accounts = {}
    for a in overview["accounts"]:
      bank_account = await _bank_account(save_fixture, user.id, name=a["id"], subtype="kf")
      bank_accounts[a["id"]] = bank_account
      await save_fixture(AvanzaAccount(connection_id=connection.id, external_id=a["id"], name=a["id"], account_type=a["type"], bank_account_id=bank_account.id))

    await avanza_service.sync(session_maker, connection.id)

    for a in overview["accounts"]:
      cash = await _cash(session, bank_accounts[a["id"]])
      balance = sum(amount if direction == TransactionDirection.credit else -amount for _, amount, direction, _ in cash)
      assert balance == round(a["balance"]["value"] * 100), a["id"]
    trades = (await session.execute(select(Trade))).scalars().all()
    assert len(trades) == sum(1 for m in avanza.movements if m["type"] in ("BUY", "SELL"))
    assert len((await session.execute(select(HoldingSnapshot))).scalars().all()) == 3

  def test_skips_cancelled_rows_and_prices_bare_trades_in_their_traded_currency(self) -> None:
    bare = {
      **movement("b1", "111", "BUY", "2026-03-08", -100.0, volume=1.0, price=9.5, price_unit="USD"),
      "orderbook": None,
      "instrumentName": "DELISTED CORP",
      "isin": "US0000000001",
      "description": "",
      "backofficeTypeText": "Köp",
    }
    cancelled = {**movement("c1", "111", "DEPOSIT", "2026-03-09", 50.0), "cancelled": True}

    [parsed] = parsing.movements({"transactions": [bare, cancelled]})

    assert parsed.instrument is not None
    assert (parsed.instrument.name, parsed.instrument.currency, parsed.description) == ("DELISTED CORP", "USD", "Köp DELISTED CORP")
