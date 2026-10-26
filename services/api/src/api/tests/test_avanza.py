import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import pytest
from api.avanza import parsing, service
from api.avanza.repository import AvanzaConnectionRepository, SecurityCatalogRepository
from api.models.avanza import AvanzaAccount, AvanzaConnection, HoldingSnapshot
from api.models.bank_account import BankAccount
from api.models.import_batch import ImportBatch
from api.models.raw_transaction import RawTransaction
from api.models.security import AssetType, Security
from api.models.trade import Trade, TradeType
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.postgres import AsyncSession
from api.settings import settings
from api.tests.avanza_responses import account, instrument, movement, overview, position, positions, transactions
from api.tests.fixtures.database import SaveFixture
from api.worker._enqueue import JobQueueManager
from httpx import AsyncClient, Response
from sqlalchemy import func, select

NOW = datetime(2026, 10, 21, 16, 30, tzinfo=UTC)
TODAY = NOW.date()
EARLIEST = date(2000, 1, 1)
MSTR = instrument("US5949724083", "Strategy A", currency="USD")
GLOBAL = instrument("SE0000000001", "Avanza Global", kind="FUND")
ACCOUNTS = overview(account("111", name="ISK", cash=250.5), account("222", "KAPITALFORSAKRING", name="KF"))


@pytest.fixture(autouse=True)
def frozen_now(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(service, "utc_now", lambda: NOW)


@pytest.fixture
def allowed(monkeypatch: pytest.MonkeyPatch, user: User) -> None:
  monkeypatch.setattr(settings, "AVANZA_USER_IDS", [user.id])


async def _upload(
  client: AsyncClient,
  *,
  accounts: dict[str, Any] = ACCOUNTS,
  held: dict[str, Any] | None = None,
  pages: list[dict[str, Any]] | None = None,
  fetched_from: date | None = EARLIEST,
  username: str = "simon",
) -> Response:
  body = {
    "username": username,
    "overview": accounts,
    "positions": held if held is not None else positions(),
    "transactions": pages if pages is not None else [transactions()],
    "fetched_from": fetched_from.isoformat() if fetched_from else None,
  }
  return await client.post("/v1/avanza/import", json=body)


async def _bank_account(save_fixture: SaveFixture, user_id: UUID, name: str = "Avanza ISK", subtype: str = "isk") -> BankAccount:
  bank_account = BankAccount(name=name, currency="SEK", base_balance=0, subtype=subtype, user_id=user_id)
  await save_fixture(bank_account)
  return bank_account


async def _connection(
  save_fixture: SaveFixture, user_id: UUID, *, linked: BankAccount | None = None, last_synced_at: datetime | None = None, **state: Any
) -> AvanzaConnection:
  connection = AvanzaConnection(user_id=user_id, username="simon", **state)
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


async def _stored(session: AsyncSession, user_id: UUID) -> AvanzaConnection:
  connection = await AvanzaConnectionRepository.from_session(session).get_for_user(user_id)
  assert connection is not None
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


async def _snapshots(session: AsyncSession, bank_account: BankAccount) -> list[HoldingSnapshot]:
  return list((await session.execute(select(HoldingSnapshot).where(HoldingSnapshot.bank_account_id == bank_account.id))).scalars())


class TestImport:
  @pytest.mark.asyncio
  async def test_only_listed_users_can_import(self, client: AsyncClient, session: AsyncSession, user: User, monkeypatch: pytest.MonkeyPatch) -> None:
    assert (await client.get("/v1/avanza")).json() == {"available": False, "connection": None}
    assert (await _upload(client)).status_code == 403
    assert (await session.execute(select(AvanzaConnection))).scalars().all() == []

    monkeypatch.setattr(settings, "AVANZA_USER_IDS", [user.id])
    assert (await client.get("/v1/avanza")).json()["available"] is True
    assert (await _upload(client)).status_code == 200

  @pytest.mark.asyncio
  async def test_the_first_import_connects_with_the_accounts_and_keeps_no_login(
    self, client: AsyncClient, session: AsyncSession, allowed: None, user: User
  ) -> None:
    response = await _upload(client, username=" simon ")

    assert response.status_code == 200
    body = response.json()
    assert (body["username"], body["sync_from"], body["last_synced_at"], body["credentials_rejected"]) == ("simon", None, "2026-10-21T16:30:00Z", False)
    assert [(a["name"], a["account_type"], a["cash_balance"], a["bank_account_id"]) for a in body["accounts"]] == [
      ("ISK", "INVESTERINGSSPARKONTO", 25050, None),
      ("KF", "KAPITALFORSAKRING", 0, None),
    ]
    assert (await _stored(session, user.id)).username == "simon"
    assert set(AvanzaConnection.__table__.columns.keys()) == {
      "id",
      "created_at",
      "modified_at",
      "deleted_at",
      "user_id",
      "username",
      "credentials_rejected_at",
      "last_synced_at",
      "sync_error",
      "stale_notified_at",
    }

  @pytest.mark.asyncio
  async def test_imports_cash_trades_and_positions_for_linked_accounts(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    await _connection(save_fixture, user.id, linked=bank_account, stale_notified_at=datetime(2026, 10, 1, tzinfo=UTC))
    page = transactions(
      movement("m1", "111", "DEPOSIT", "2026-03-01", 10000.0, description="Insättning"),
      movement("m2", "111", "BUY", "2026-03-08", -3600.5, inst=MSTR, volume=1.0, price=342.15, price_unit="USD", commission=1.0, description="Köp Strategy A"),
      movement("m3", "111", "SELL", "2026-06-01", 500.0, inst=GLOBAL, volume=-2.5, price=200.0, description="Sälj Avanza Global"),
      movement("m4", "111", "DIVIDEND", "2026-06-15", 12.34, inst=MSTR, description="Utdelning"),
      movement("m5", "111", "BUY", TODAY.isoformat(), -99.0, inst=GLOBAL, volume=0.5, price=198.0, intraday=True),
      movement("k1", "222", "DEPOSIT", "2026-03-01", 777.0),
    )
    held = positions(position("111", MSTR, volume=1.0, value=3900.0, acquired=3601.5), position("222", GLOBAL, volume=4.0, value=800.0, acquired=700.0))

    response = await _upload(client, held=held, pages=[page])

    assert response.status_code == 200
    assert await _cash(session, bank_account) == [
      (date(2026, 3, 1), 1000000, TransactionDirection.credit, "Insättning"),
      (date(2026, 3, 8), 360050, TransactionDirection.debit, "Köp Strategy A"),
      (date(2026, 6, 1), 50000, TransactionDirection.credit, "Sälj Avanza Global"),
      (date(2026, 6, 15), 1234, TransactionDirection.credit, "Utdelning"),
    ]
    kinds = (await session.execute(select(Transaction.transaction_type).where(Transaction.bank_account_id == bank_account.id))).scalars().all()
    assert sorted(kinds) == ["BUY", "DEPOSIT", "DIVIDEND", "SELL"]
    assert await _trades(session, bank_account) == [
      (TradeType.buy, date(2026, 3, 8), 1_000_000, 34215, "USD", "Courtage 1.0 SEK"),
      (TradeType.sell, date(2026, 6, 1), 2_500_000, 20000, "SEK", None),
    ]
    security = (await session.execute(select(Security).where(Security.isin == MSTR["isin"]))).scalar_one()
    assert (security.name, security.asset_type, security.currency) == ("Strategy A", AssetType.stock, "USD")
    [snapshot] = await _snapshots(session, bank_account)
    assert (snapshot.snapshot_date, snapshot.quantity, snapshot.value, snapshot.acquired_value, snapshot.currency) == (TODAY, 1_000_000, 390000, 360150, "SEK")
    stored = await _stored(session, user.id)
    assert (stored.last_synced_at, stored.stale_notified_at, stored.accounts[0].last_synced_at, stored.accounts[0].cash_balance) == (NOW, None, NOW, 25050)
    assert response.json()["sync_from"] == (TODAY - timedelta(days=14)).isoformat()

  @pytest.mark.asyncio
  async def test_importing_again_adds_nothing_twice(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    await _connection(save_fixture, user.id, linked=bank_account)
    page = transactions(movement("m1", "111", "BUY", "2026-10-10", -100.0, inst=GLOBAL, volume=0.5, price=200.0))
    held = positions(position("111", GLOBAL, volume=0.5, value=101.0, acquired=100.0))

    first = await _upload(client, held=held, pages=[page])
    second = await _upload(client, held=held, pages=[page], fetched_from=date.fromisoformat(first.json()["sync_from"]))

    assert second.status_code == 200
    assert len(await _cash(session, bank_account)) == 1
    assert len(await _trades(session, bank_account)) == 1
    assert len(await _snapshots(session, bank_account)) == 1

  @pytest.mark.asyncio
  async def test_overlapping_pages_count_each_transaction_once(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    await _connection(save_fixture, user.id, linked=bank_account)
    shared = movement("m2", "111", "DEPOSIT", "2026-05-01", 20.0)
    pages = [
      transactions(movement("m1", "111", "DEPOSIT", "2026-04-01", 10.0), shared),
      transactions(shared, movement("m3", "111", "DEPOSIT", "2026-06-01", 30.0)),
    ]

    assert (await _upload(client, pages=pages)).status_code == 200

    assert len(await _cash(session, bank_account)) == 3
    assert (await session.execute(select(func.count()).select_from(RawTransaction))).scalar_one() == 3
    assert (await session.execute(select(ImportBatch.row_count))).scalar_one() == 3

  @pytest.mark.asyncio
  async def test_an_account_linked_after_the_app_read_sync_from_waits_for_the_next_import(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    isk, kf = await _bank_account(save_fixture, user.id), await _bank_account(save_fixture, user.id, "Avanza KF", "kf")
    connection = await _connection(save_fixture, user.id, linked=isk, last_synced_at=NOW - timedelta(days=1))
    await save_fixture(AvanzaAccount(connection_id=connection.id, external_id="222", name="KF", account_type="KAPITALFORSAKRING", bank_account_id=kf.id))
    read_before_linking = (NOW - timedelta(days=15)).date()
    page = transactions(movement("m1", "111", "DEPOSIT", "2026-10-15", 10.0), movement("k1", "222", "DEPOSIT", "2026-10-15", 20.0))
    held = positions(position("111", GLOBAL, volume=1.0, value=10.0, acquired=10.0), position("222", GLOBAL, volume=2.0, value=20.0, acquired=20.0))

    response = await _upload(client, held=held, pages=[page], fetched_from=read_before_linking)

    assert response.status_code == 200
    assert (len(await _cash(session, isk)), len(await _snapshots(session, isk))) == (1, 1)
    assert (await _cash(session, kf), await _snapshots(session, kf)) == ([], [])
    stored = {a.external_id: a.last_synced_at for a in (await _stored(session, user.id)).accounts}
    assert stored == {"111": NOW, "222": None}
    assert response.json()["sync_from"] == EARLIEST.isoformat()

  @pytest.mark.asyncio
  @pytest.mark.parametrize(("with_positions", "fetched_from"), [(False, EARLIEST), (True, None)], ids=["no-positions", "no-transactions"])
  async def test_an_upload_missing_positions_or_transactions_imports_nothing(
    self,
    client: AsyncClient,
    session: AsyncSession,
    save_fixture: SaveFixture,
    allowed: None,
    user: User,
    with_positions: bool,
    fetched_from: date | None,
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    await _connection(save_fixture, user.id, linked=bank_account)
    body = {
      "username": "simon",
      "overview": ACCOUNTS,
      "positions": positions(position("111", GLOBAL, volume=1.0, value=10.0, acquired=10.0)) if with_positions else None,
      "transactions": [transactions(movement("m1", "111", "DEPOSIT", "2026-10-15", 10.0))] if fetched_from else [],
      "fetched_from": fetched_from.isoformat() if fetched_from else None,
    }

    response = await client.post("/v1/avanza/import", json=body)

    assert response.status_code == 200
    assert (await _cash(session, bank_account), await _snapshots(session, bank_account)) == ([], [])
    assert (await _stored(session, user.id)).accounts[0].last_synced_at is None
    assert response.json()["sync_from"] == EARLIEST.isoformat()

  @pytest.mark.asyncio
  @pytest.mark.parametrize(
    "upload",
    [
      {"overview": {"accounts": [{"name": {"userDefinedName": "Simons ISK 5566"}}]}},
      {"overview": {"accounts": "Simons ISK 5566"}},
      {"transactions": [{"transactions": [{**movement("m1", "111", "DEPOSIT", "2026-10-15", 10.0), "tradeDate": "Simons ISK 5566"}]}]},
      {"positions": {"withOrderbook": [{"account": "Simons ISK 5566", "instrument": GLOBAL}]}},
    ],
    ids=["missing-id", "not-a-list", "bad-date", "bad-account"],
  )
  async def test_malformed_data_is_refused_without_repeating_it(
    self, client: AsyncClient, session: AsyncSession, allowed: None, upload: dict[str, Any]
  ) -> None:
    body = {"username": "simon", "overview": ACCOUNTS, "positions": positions(), "transactions": [], "fetched_from": None, **upload}

    response = await client.post("/v1/avanza/import", json=body)

    assert (response.status_code, response.json()["detail"]) == (422, "Avanza's data wasn't in the expected shape.")
    assert "5566" not in response.text
    assert (await session.execute(select(AvanzaConnection))).scalars().all() == []

  @pytest.mark.asyncio
  async def test_sync_from_is_where_the_linked_account_furthest_behind_needs_to_start(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    async def sync_from() -> str | None:
      return (await client.get("/v1/avanza")).json()["connection"]["sync_from"]

    await _connection(save_fixture, user.id, last_synced_at=NOW - timedelta(days=1))
    assert await sync_from() is None

    isk, kf = await _bank_account(save_fixture, user.id), await _bank_account(save_fixture, user.id, "Avanza KF", "kf")
    stored = await _stored(session, user.id)
    stored.accounts[0].bank_account_id = isk.id
    stored.accounts.append(
      AvanzaAccount(external_id="222", name="KF", account_type="KAPITALFORSAKRING", bank_account_id=kf.id, last_synced_at=NOW - timedelta(days=3))
    )
    await session.flush()
    assert await sync_from() == (NOW - timedelta(days=17)).date().isoformat()

    stored = await _stored(session, user.id)
    stored.accounts[0].last_synced_at = None
    await session.flush()
    assert await sync_from() == EARLIEST.isoformat()


class TestSyncFailed:
  @pytest.mark.asyncio
  async def test_a_rejected_login_asks_to_sign_in_again_until_the_next_import(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    await _connection(save_fixture, user.id)

    assert (await client.post("/v1/avanza/sync-failed", json={"reason": "rejected"})).status_code == 204

    connection = (await client.get("/v1/avanza")).json()["connection"]
    assert (connection["credentials_rejected"], connection["sync_error"]) == (True, service.REJECTED)
    assert (await _stored(session, user.id)).credentials_rejected_at == NOW

    body = (await _upload(client, username="simon.risberg")).json()
    assert (body["credentials_rejected"], body["sync_error"], body["username"]) == (False, None, "simon.risberg")

  @pytest.mark.asyncio
  async def test_avanza_being_unreachable_is_recorded_without_asking_to_sign_in(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    await _connection(save_fixture, user.id, last_synced_at=NOW - timedelta(days=2))

    assert (await client.post("/v1/avanza/sync-failed", json={"reason": "unreachable"})).status_code == 204

    stored = await _stored(session, user.id)
    assert (stored.sync_error, stored.credentials_rejected_at, stored.last_synced_at) == (service.UNREACHABLE, None, None)
    assert (await _upload(client)).json()["sync_error"] is None

  @pytest.mark.asyncio
  async def test_reporting_without_a_connection_or_with_another_reason_is_refused(
    self, client: AsyncClient, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    assert (await client.post("/v1/avanza/sync-failed", json={"reason": "rejected"})).status_code == 404
    await _connection(save_fixture, user.id)
    assert (await client.post("/v1/avanza/sync-failed", json={"reason": "locked"})).status_code == 422


class TestLink:
  @pytest.mark.asyncio
  async def test_linking_reads_the_whole_history_next_and_one_bessel_account_takes_one_avanza_account(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User, job_queue_manager: JobQueueManager
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, last_synced_at=NOW)
    await save_fixture(AvanzaAccount(connection_id=connection.id, external_id="222", name="KF", account_type="KAPITALFORSAKRING"))
    first, second = [a["id"] for a in (await client.get("/v1/avanza")).json()["connection"]["accounts"]]

    linked = await client.patch(f"/v1/avanza/accounts/{first}", json={"bank_account_id": str(bank_account.id)})
    taken = await client.patch(f"/v1/avanza/accounts/{second}", json={"bank_account_id": str(bank_account.id)})

    assert linked.status_code == 200
    assert (linked.json()["accounts"][0]["bank_account_id"], linked.json()["sync_from"]) == (str(bank_account.id), EARLIEST.isoformat())
    assert taken.status_code == 409
    assert (await _stored(session, user.id)).accounts[0].last_synced_at is None
    assert job_queue_manager._enqueued_jobs == []

  @pytest.mark.asyncio
  async def test_choosing_the_same_account_again_keeps_the_sync_position(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    await _connection(save_fixture, user.id, linked=bank_account, last_synced_at=NOW)
    [account_id] = [a["id"] for a in (await client.get("/v1/avanza")).json()["connection"]["accounts"]]

    assert (await client.patch(f"/v1/avanza/accounts/{account_id}", json={"bank_account_id": str(bank_account.id)})).status_code == 200

    assert (await _stored(session, user.id)).accounts[0].last_synced_at == NOW


class TestSecurityNames:
  @pytest.mark.asyncio
  async def test_avanzas_short_all_caps_name_gives_way_to_the_display_name(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    await _connection(save_fixture, user.id, linked=await _bank_account(save_fixture, user.id))
    bare = {
      **movement("b1", "111", "BUY", "2026-03-08", -100.0, volume=1.0, price=9.5, price_unit="USD"),
      "orderbook": None,
      "instrumentName": "MICROSTRATEGY INC",
      "isin": MSTR["isin"],
      "description": "",
    }

    await _upload(client, pages=[transactions(bare, movement("b2", "111", "BUY", "2026-03-09", -100.0, inst=MSTR, volume=1.0, price=9.5, price_unit="USD"))])

    assert (await session.execute(select(Security.name).where(Security.isin == MSTR["isin"]))).scalar_one() == "Strategy A"

  @pytest.mark.asyncio
  async def test_a_good_name_isnt_replaced_by_the_short_one(self, session: AsyncSession) -> None:
    repository = SecurityCatalogRepository.from_session(session)
    await repository.get_or_create_by_isin(isin="SE0000000002", name="Volvo B", asset_type=AssetType.stock, currency="SEK")
    await repository.get_or_create_by_isin(isin="SE0000000002", name="VOLVO B", asset_type=AssetType.stock, currency="SEK")
    security = await repository.get_or_create_by_isin(isin="SE0000000002", name="Volvo, AB ser. B", asset_type=AssetType.stock, currency="SEK")
    assert security.name == "Volvo B"


class TestHoldings:
  @pytest.mark.asyncio
  async def test_synced_accounts_show_avanzas_positions_instead_of_adding_up_trades(
    self, client: AsyncClient, save_fixture: SaveFixture, allowed: None, user: User
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
    await _connection(save_fixture, user.id, linked=synced)
    await _upload(client, held=positions(position("111", MSTR, volume=2.0, value=8000.0, acquired=7000.0)))

    holdings = {h["security_name"]: h for h in (await client.get("/v1/investments/holdings")).json()["items"]}

    assert holdings["Hand entered"]["quantity"] == 3_000_000
    strategy = holdings["Strategy A"]
    # Avanza values positions in the account's currency, so a US stock shows in SEK.
    assert (strategy["currency"], strategy["quantity"], strategy["current_value"], strategy["cost_basis"]) == ("SEK", 2_000_000, 800000, 700000)
    assert (strategy["current_price"], strategy["avg_cost_per_unit"], strategy["gain_loss"], strategy["gain_loss_pct"]) == (400000, 350000, 100000, 14.29)


class TestIsolation:
  @pytest.mark.asyncio
  async def test_other_users_cant_see_link_report_or_disconnect(
    self, client: AsyncClient, other_client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, user: User, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    await _connection(save_fixture, user.id)
    account_id = (await _stored(session, user.id)).accounts[0].id
    others = (await other_client.post("/v1/bank-accounts", json={"name": "B", "currency": "SEK", "subtype": "isk"})).json()
    other_id = (await session.execute(select(User.id).where(User.id != user.id))).scalar_one()
    monkeypatch.setattr(settings, "AVANZA_USER_IDS", [user.id, other_id])

    assert (await other_client.get("/v1/avanza")).json()["connection"] is None
    assert (await other_client.patch(f"/v1/avanza/accounts/{account_id}", json={"bank_account_id": others["id"]})).status_code == 404
    assert (await other_client.post("/v1/avanza/sync-failed", json={"reason": "rejected"})).status_code == 404
    assert (await other_client.delete("/v1/avanza")).status_code == 404
    assert (await client.patch(f"/v1/avanza/accounts/{account_id}", json={"bank_account_id": others["id"]})).status_code == 404
    mine = (await client.get("/v1/avanza")).json()["connection"]
    assert (mine["accounts"][0]["bank_account_id"], mine["sync_error"], mine["credentials_rejected"]) == (None, None, False)

  @pytest.mark.asyncio
  async def test_another_users_import_connects_their_own_avanza(
    self, client: AsyncClient, other_client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, user: User, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    await _connection(save_fixture, user.id)
    assert (await other_client.get("/v1/avanza")).json()["connection"] is None
    other_id = (await session.execute(select(User.id).where(User.id != user.id))).scalar_one()
    monkeypatch.setattr(settings, "AVANZA_USER_IDS", [user.id, other_id])

    response = await _upload(other_client, accounts=overview(account("999", name="Theirs")), username="someone")

    assert response.status_code == 200
    mine = (await client.get("/v1/avanza")).json()["connection"]
    assert (mine["username"], [a["name"] for a in mine["accounts"]], mine["last_synced_at"]) == ("simon", ["ISK"], None)
    theirs = (await other_client.get("/v1/avanza")).json()["connection"]
    assert (theirs["username"], [a["name"] for a in theirs["accounts"]]) == ("someone", ["Theirs"])


class TestDisconnect:
  @pytest.mark.asyncio
  async def test_disconnecting_forgets_the_connection_and_keeps_imports(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    await _connection(save_fixture, user.id, linked=bank_account)
    await _upload(client, pages=[transactions(movement("m1", "111", "DEPOSIT", "2026-03-01", 10.0))])

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
    held = parsing.positions(_fixture("positions.json"))
    movements = parsing.movements(_fixture("transactions.json"))

    assert [a.account_type for a in accounts] == ["AKTIEFONDKONTO", "KAPITALFORSAKRING", "KAPITALFORSAKRING"]
    # Funds and delisted holdings come without an order book.
    assert len(held) == 3 and {p.currency for p in held} == {"SEK"}
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
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, allowed: None, user: User
  ) -> None:
    accounts, page = _fixture("overview.json"), _fixture("transactions.json")
    connection = AvanzaConnection(user_id=user.id, username="simon")
    await save_fixture(connection)
    bank_accounts = {}
    for a in accounts["accounts"]:
      bank_account = await _bank_account(save_fixture, user.id, name=a["id"], subtype="kf")
      bank_accounts[a["id"]] = bank_account
      await save_fixture(AvanzaAccount(connection_id=connection.id, external_id=a["id"], name=a["id"], account_type=a["type"], bank_account_id=bank_account.id))

    assert (await _upload(client, accounts=accounts, held=_fixture("positions.json"), pages=[page])).status_code == 200

    for a in accounts["accounts"]:
      cash = await _cash(session, bank_accounts[a["id"]])
      balance = sum(amount if direction == TransactionDirection.credit else -amount for _, amount, direction, _ in cash)
      assert balance == round(a["balance"]["value"] * 100), a["id"]
    trades = (await session.execute(select(Trade))).scalars().all()
    assert len(trades) == sum(1 for m in page["transactions"] if m["type"] in ("BUY", "SELL"))
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
