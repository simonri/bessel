import json
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo

import httpx
import pytest
from api.common.encryption import decrypt, encrypt
from api.models.bank_account import BankAccount
from api.models.bank_connection import BankConnection, BankConnectionAccount
from api.models.notification import Notification
from api.models.transaction import Transaction, TransactionDirection
from api.models.user import User
from api.open_banking import http, service, tasks
from api.open_banking.repository import BankConnectionRepository
from api.open_banking.service import SessionMaker, open_banking_service
from api.postgres import AsyncSession
from api.settings import settings
from api.tests.enable_banking_fake import APP_ID, FakeEnableBanking, account, generate_key, transaction
from api.tests.fixtures.database import SaveFixture
from api.worker import scheduler_middleware
from api.worker._enqueue import JobQueueManager
from cryptography.fernet import Fernet
from httpx import AsyncClient
from jose import jwt
from sqlalchemy import select

NOW = datetime(2026, 10, 21, 12, tzinfo=UTC)
TODAY = NOW.date()
PRIVATE_KEY, PUBLIC_KEY = generate_key()
VALID_UNTIL = "2027-04-19T12:00:00+00:00"


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())


@pytest.fixture(autouse=True)
def frozen_now(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(service, "utc_now", lambda: NOW)


@pytest.fixture
def bank(monkeypatch: pytest.MonkeyPatch) -> FakeEnableBanking:
  fake = FakeEnableBanking(public_key=PUBLIC_KEY)
  monkeypatch.setattr(http, "client", lambda: httpx.AsyncClient(transport=fake.transport()))
  return fake


@pytest.fixture
def configured(monkeypatch: pytest.MonkeyPatch, user: User) -> None:
  monkeypatch.setattr(settings, "ENABLE_BANKING_APP_ID", APP_ID)
  # As Infisical stores it: one line with literal "\n" between the PEM lines.
  monkeypatch.setattr(settings, "ENABLE_BANKING_PRIVATE_KEY", PRIVATE_KEY.replace("\n", "\\n"))
  monkeypatch.setattr(settings, "ENABLE_BANKING_PRIVATE_KEY_PATH", "")
  monkeypatch.setattr(settings, "ENABLE_BANKING_REDIRECT_URL", "")
  monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "https://app.example.com")
  monkeypatch.setattr(settings, "ENABLE_BANKING_USER_IDS", [user.id])


@pytest.fixture
def session_maker(session: AsyncSession) -> SessionMaker:
  @asynccontextmanager
  async def maker() -> AsyncIterator[AsyncSession]:
    yield session
    await session.flush()

  return maker


def _state(user_id: UUID) -> str:
  return encrypt(json.dumps({"user_id": str(user_id)}))


async def _bank_account(save_fixture: SaveFixture, user_id: UUID, name: str = "Skandia") -> BankAccount:
  bank_account = BankAccount(name=name, currency="SEK", base_balance=0, subtype="checking", user_id=user_id)
  await save_fixture(bank_account)
  return bank_account


async def _hand_imported(
  save_fixture: SaveFixture, bank_account: BankAccount, day: date, amount: int, *, direction: TransactionDirection = TransactionDirection.debit
) -> None:
  await save_fixture(
    Transaction(
      amount=amount,
      currency="SEK",
      transaction_date=day,
      direction=direction,
      dedup_hash=uuid4().hex,
      description="Kortköp ICA KVANTUM",
      bank_account_id=bank_account.id,
      user_id=bank_account.user_id,
    )
  )


async def _connection(
  save_fixture: SaveFixture, user_id: UUID, *, uid: str = "uid-1", bank_account: BankAccount | None = None, import_from: date | None = None
) -> BankConnection:
  connection = BankConnection(
    user_id=user_id,
    bank_name="Skandia",
    bank_country="SE",
    encrypted_session_id=encrypt("session-old"),
    valid_until=NOW + timedelta(days=100),
  )
  await save_fixture(connection)
  await save_fixture(
    BankConnectionAccount(
      connection_id=connection.id,
      identification_hash="hash-1",
      uid=uid,
      name="Allkonto",
      iban=None,
      currency="SEK",
      bank_account_id=bank_account.id if bank_account else None,
      import_from=import_from,
    )
  )
  return connection


async def _transactions(session: AsyncSession, bank_account: BankAccount) -> list[tuple[date, int, TransactionDirection, str | None]]:
  rows = await session.execute(
    select(Transaction.transaction_date, Transaction.amount, Transaction.direction, Transaction.description)
    .where(Transaction.bank_account_id == bank_account.id)
    .order_by(Transaction.transaction_date, Transaction.amount)
  )
  return [tuple(row) for row in rows]  # type: ignore[misc]


class TestAvailability:
  @pytest.mark.asyncio
  async def test_only_listed_users_see_bank_connections(self, client: AsyncClient, configured: None, monkeypatch: pytest.MonkeyPatch) -> None:
    assert (await client.get("/v1/bank-connections")).json() == {"available": True, "bank_name": "Skandia", "connections": []}

    monkeypatch.setattr(settings, "ENABLE_BANKING_USER_IDS", [uuid4()])
    assert (await client.get("/v1/bank-connections")).json()["available"] is False
    assert (await client.post("/v1/bank-connections/authorize")).status_code == 403
    assert (await client.post("/v1/bank-connections/callback", json={"code": "c", "state": "s"})).status_code == 403

  @pytest.mark.asyncio
  async def test_unconfigured_is_unavailable_even_for_listed_users(self, client: AsyncClient, configured: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ENABLE_BANKING_PRIVATE_KEY", "")
    assert (await client.get("/v1/bank-connections")).json()["available"] is False
    assert (await client.post("/v1/bank-connections/authorize")).status_code == 403


class TestConnect:
  @pytest.mark.asyncio
  async def test_authorize_asks_for_skandia_for_as_long_as_it_allows(self, client: AsyncClient, configured: None, bank: FakeEnableBanking, user: User) -> None:
    response = await client.post("/v1/bank-connections/authorize")

    assert response.status_code == 200
    assert response.json()["url"] == "https://tilisy.example/authorize?id=1"
    [request] = bank.auth_requests
    assert request["aspsp"] == {"name": "Skandia", "country": "SE"}
    assert request["psu_type"] == "personal"
    assert request["redirect_url"] == "https://app.example.com/bank-connections/callback"
    assert datetime.fromisoformat(request["access"]["valid_until"]) == NOW + timedelta(days=180, hours=-1)
    assert json.loads(decrypt(request["state"]))["user_id"] == str(user.id)

  @pytest.mark.asyncio
  async def test_the_bank_can_be_switched_for_local_testing(
    self, client: AsyncClient, configured: None, bank: FakeEnableBanking, monkeypatch: pytest.MonkeyPatch
  ) -> None:
    monkeypatch.setattr(settings, "ENABLE_BANKING_BANK_NAME", "Mock ASPSP")

    assert (await client.get("/v1/bank-connections")).json()["bank_name"] == "Mock ASPSP"
    assert (await client.post("/v1/bank-connections/authorize")).status_code == 200
    [request] = bank.auth_requests
    assert request["aspsp"] == {"name": "Mock ASPSP", "country": "SE"}
    assert datetime.fromisoformat(request["access"]["valid_until"]) == NOW + timedelta(days=10, hours=-1)

  @pytest.mark.asyncio
  async def test_requests_are_signed_with_the_app_key(self, configured: None, bank: FakeEnableBanking, monkeypatch: pytest.MonkeyPatch) -> None:
    other_private, _ = generate_key()
    monkeypatch.setattr(settings, "ENABLE_BANKING_PRIVATE_KEY", other_private)
    with pytest.raises(Exception, match="Invalid token"):
      await open_banking_service.start_connection(settings.ENABLE_BANKING_USER_IDS[0])
    assert bank.auth_requests == []

  @pytest.mark.asyncio
  async def test_token_names_the_app_and_expires_within_a_day(self, configured: None) -> None:
    client = service._client(httpx.AsyncClient())
    token = client._token()
    claims = jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"], audience="api.enablebanking.com")
    assert jwt.get_unverified_header(token)["kid"] == APP_ID
    assert 0 < claims["exp"] - claims["iat"] <= 86400

  @pytest.mark.asyncio
  async def test_callback_stores_the_session_and_accounts(
    self, client: AsyncClient, session: AsyncSession, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank.approvals["code-1"] = (VALID_UNTIL, [account("uid-1", "hash-1"), account("uid-2", "hash-2", name="Sparkonto")])

    response = await client.post("/v1/bank-connections/callback", json={"code": "code-1", "state": _state(user.id)})

    assert response.status_code == 201
    body = response.json()
    assert body["bank_name"] == "Skandia"
    assert body["valid_until"] == "2027-04-19T12:00:00Z"
    assert [(a["name"], a["iban"], a["bank_account_id"]) for a in body["accounts"]] == [
      ("Allkonto", "SE4591500000000000001234", None),
      ("Sparkonto", "SE4591500000000000001234", None),
    ]
    connection = (await session.execute(select(BankConnection))).scalar_one()
    assert decrypt(connection.encrypted_session_id) == "session-1"
    assert "session" not in json.dumps(body)

  @pytest.mark.asyncio
  async def test_callback_rejects_a_state_from_another_user_or_an_old_link(
    self, client: AsyncClient, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank.approvals["code-1"] = (VALID_UNTIL, [account("uid-1", "hash-1")])

    other = await client.post("/v1/bank-connections/callback", json={"code": "code-1", "state": _state(uuid4())})
    assert other.status_code == 400
    assert "different Bessel account" in other.json()["detail"]

    twenty_minutes_ago = int(time.time()) - 20 * 60
    stale = Fernet(settings.CREDENTIALS_ENCRYPTION_KEY).encrypt_at_time(json.dumps({"user_id": str(user.id)}).encode(), twenty_minutes_ago).decode()
    expired = await client.post("/v1/bank-connections/callback", json={"code": "code-1", "state": stale})
    assert expired.status_code == 400
    assert "expired" in expired.json()["detail"]
    assert "code-1" in bank.approvals

  @pytest.mark.asyncio
  async def test_renewing_keeps_links_updates_uids_and_closes_the_old_session(
    self,
    client: AsyncClient,
    session: AsyncSession,
    save_fixture: SaveFixture,
    configured: None,
    bank: FakeEnableBanking,
    user: User,
    job_queue_manager: JobQueueManager,
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, uid="old-uid", bank_account=bank_account, import_from=TODAY)
    connection.expiry_notified_at = NOW
    connection.sync_error = "Skandia's approval has ended. Renew it with BankID."
    await session.flush()
    bank.approvals["code-2"] = (VALID_UNTIL, [account("new-uid", "hash-1")])

    response = await client.post("/v1/bank-connections/callback", json={"code": "code-2", "state": _state(user.id)})

    assert response.status_code == 201
    [linked] = response.json()["accounts"]
    assert linked["bank_account_id"] == str(bank_account.id)
    assert linked["import_from"] == TODAY.isoformat()
    renewed = await BankConnectionRepository.from_session(session).get_with_accounts(connection.id)
    assert renewed is not None
    assert [a.uid for a in renewed.accounts] == ["new-uid"]
    assert (renewed.expiry_notified_at, renewed.sync_error) == (None, None)
    assert bank.deleted_sessions == ["session-old"]
    assert [job[:2] for job in job_queue_manager._enqueued_jobs] == [("sync_bank_connection", (str(connection.id),))]


class TestLinkAccount:
  @pytest.mark.asyncio
  async def test_linking_starts_from_the_newest_hand_imported_day(
    self, client: AsyncClient, save_fixture: SaveFixture, configured: None, user: User, job_queue_manager: JobQueueManager
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    await _hand_imported(save_fixture, bank_account, date(2026, 10, 3), 5000)
    await _hand_imported(save_fixture, bank_account, date(2026, 10, 15), 9900)
    connection = await _connection(save_fixture, user.id)
    account_id = (await client.get("/v1/bank-connections")).json()["connections"][0]["accounts"][0]["id"]

    response = await client.patch(f"/v1/bank-connections/accounts/{account_id}", json={"bank_account_id": str(bank_account.id)})

    assert response.status_code == 200
    assert response.json()["accounts"][0]["import_from"] == "2026-10-15"
    assert [job[:2] for job in job_queue_manager._enqueued_jobs] == [("sync_bank_connection", (str(connection.id),))]

  @pytest.mark.asyncio
  async def test_an_empty_account_imports_the_last_year_and_unlinking_stops_it(
    self, client: AsyncClient, save_fixture: SaveFixture, configured: None, user: User, job_queue_manager: JobQueueManager
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    await _connection(save_fixture, user.id)
    account_id = (await client.get("/v1/bank-connections")).json()["connections"][0]["accounts"][0]["id"]

    linked = await client.patch(f"/v1/bank-connections/accounts/{account_id}", json={"bank_account_id": str(bank_account.id)})
    assert linked.json()["accounts"][0]["import_from"] == (TODAY - timedelta(days=365)).isoformat()

    unlinked = await client.patch(f"/v1/bank-connections/accounts/{account_id}", json={"bank_account_id": None})
    assert (unlinked.json()["accounts"][0]["bank_account_id"], unlinked.json()["accounts"][0]["import_from"]) == (None, None)
    assert len(job_queue_manager._enqueued_jobs) == 1


class TestSync:
  @pytest.mark.asyncio
  async def test_imports_booked_transactions_from_every_page(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, bank_account=bank_account, import_from=date(2026, 10, 1))
    bank.transactions["uid-1"] = [
      transaction("r1", date(2026, 10, 2), "-125.50", text="Systembolaget"),
      transaction("r2", date(2026, 10, 3), "25000.00", credit=True, text="Lön"),
      transaction("r3", date(2026, 10, 4), "-89.00", text="Spotify"),
      transaction("r4", date(2026, 10, 5), "-10.00", status="PDNG"),
      transaction("r0", date(2026, 9, 30), "-1.00", text="Before linking"),
    ]

    await open_banking_service.sync(session_maker, connection.id)

    assert await _transactions(session, bank_account) == [
      (date(2026, 10, 2), 12550, TransactionDirection.debit, "Systembolaget"),
      (date(2026, 10, 3), 2500000, TransactionDirection.credit, "Lön"),
      (date(2026, 10, 4), 8900, TransactionDirection.debit, "Spotify"),
    ]
    assert [r.get("continuation_key") for r in bank.transaction_requests] == [None, "2"]
    assert {r["transaction_status"] for r in bank.transaction_requests} == {"BOOK"}
    refreshed = await BankConnectionRepository.from_session(session).get_by_id(connection.id)
    assert refreshed is not None and refreshed.last_synced_at == NOW

  @pytest.mark.asyncio
  async def test_keeps_only_booked_days_from_linking_on_when_the_bank_returns_more(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, bank_account=bank_account, import_from=date(2026, 10, 1))
    bank.ignores_filters = True
    bank.transactions["uid-1"] = [
      transaction("r0", date(2026, 9, 30), "-1.00"),
      transaction("r1", date(2026, 10, 2), "-2.00"),
      transaction("r2", date(2026, 10, 3), "-3.00", status="PDNG"),
    ]

    await open_banking_service.sync(session_maker, connection.id)

    assert [row[1] for row in await _transactions(session, bank_account)] == [200]

  @pytest.mark.asyncio
  async def test_the_same_bank_reference_in_two_accounts_is_two_transactions(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    checking, savings = await _bank_account(save_fixture, user.id), await _bank_account(save_fixture, user.id, "Sparkonto")
    connection = await _connection(save_fixture, user.id, bank_account=checking, import_from=date(2026, 10, 1))
    await save_fixture(
      BankConnectionAccount(
        connection_id=connection.id, identification_hash="hash-2", uid="uid-2", currency="SEK", bank_account_id=savings.id, import_from=date(2026, 10, 1)
      )
    )
    bank.transactions["uid-1"] = [transaction("1", date(2026, 10, 2), "-500.00", text="Överföring")]
    bank.transactions["uid-2"] = [transaction("1", date(2026, 10, 2), "500.00", credit=True, text="Överföring")]

    await open_banking_service.sync(session_maker, connection.id)

    assert len(await _transactions(session, checking)) == 1
    assert len(await _transactions(session, savings)) == 1

  @pytest.mark.asyncio
  async def test_syncing_again_or_after_renewing_imports_nothing_twice(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, bank_account=bank_account, import_from=date(2026, 10, 1))
    booked = [transaction("r1", date(2026, 10, 2), "-50.00"), transaction(None, date(2026, 10, 2), "-50.00"), transaction(None, date(2026, 10, 2), "-50.00")]
    bank.transactions["uid-1"] = booked

    await open_banking_service.sync(session_maker, connection.id)
    await open_banking_service.sync(session_maker, connection.id)
    renewed = await BankConnectionRepository.from_session(session).get_with_accounts(connection.id)
    assert renewed is not None
    renewed.accounts[0].uid = "uid-after-renewal"
    bank.transactions["uid-after-renewal"] = booked
    await open_banking_service.sync(session_maker, connection.id)

    assert len(await _transactions(session, bank_account)) == 3

  @pytest.mark.asyncio
  async def test_reads_a_week_back_from_the_last_sync(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, bank_account=bank_account, import_from=date(2026, 9, 1))
    stored = await BankConnectionRepository.from_session(session).get_with_accounts(connection.id)
    assert stored is not None
    stored.accounts[0].last_synced_at = datetime(2026, 10, 20, 6, tzinfo=UTC)
    bank.transactions["uid-1"] = []

    await open_banking_service.sync(session_maker, connection.id)

    assert bank.transaction_requests[0]["date_from"] == "2026-10-13"

  @pytest.mark.asyncio
  async def test_switchover_day_skips_what_was_imported_by_hand(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    day = date(2026, 10, 15)
    await _hand_imported(save_fixture, bank_account, day, 9900)
    connection = await _connection(save_fixture, user.id, bank_account=bank_account, import_from=day)
    bank.transactions["uid-1"] = [
      # Same purchase the export already had, under the bank's own wording.
      transaction("r1", day, "-99.00", text="ICA KVANTUM SÖDER"),
      transaction("r2", day, "-99.00", text="ICA KVANTUM SÖDER"),
      transaction("r3", day, "99.00", credit=True, text="Swish från Anna"),
      transaction("r4", date(2026, 10, 16), "-99.00", text="ICA KVANTUM SÖDER"),
    ]

    await open_banking_service.sync(session_maker, connection.id)
    await open_banking_service.sync(session_maker, connection.id)

    assert await _transactions(session, bank_account) == [
      (day, 9900, TransactionDirection.debit, "Kortköp ICA KVANTUM"),
      (day, 9900, TransactionDirection.debit, "ICA KVANTUM SÖDER"),
      (day, 9900, TransactionDirection.credit, "Swish från Anna"),
      (date(2026, 10, 16), 9900, TransactionDirection.debit, "ICA KVANTUM SÖDER"),
    ]

  @pytest.mark.asyncio
  async def test_switchover_day_counts_only_hand_imported_rows_against_late_bookings(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    day = date(2026, 10, 15)
    await _hand_imported(save_fixture, bank_account, day, 9900)
    connection = await _connection(save_fixture, user.id, bank_account=bank_account, import_from=day)
    first, second = transaction("r1", day, "-99.00"), transaction("r2", day, "-99.00")
    bank.transactions["uid-1"] = [first, second]
    await open_banking_service.sync(session_maker, connection.id)

    # A third purchase on the same day is booked late, and listed first.
    bank.transactions["uid-1"] = [transaction("r3", day, "-99.00"), first, second]
    await open_banking_service.sync(session_maker, connection.id)

    assert [row[1] for row in await _transactions(session, bank_account)] == [9900, 9900, 9900]

  @pytest.mark.asyncio
  async def test_an_account_linked_after_another_synced_gets_its_whole_history(
    self,
    client: AsyncClient,
    session: AsyncSession,
    session_maker: SessionMaker,
    save_fixture: SaveFixture,
    configured: None,
    bank: FakeEnableBanking,
    user: User,
    job_queue_manager: JobQueueManager,
  ) -> None:
    checking, savings = await _bank_account(save_fixture, user.id), await _bank_account(save_fixture, user.id, "Sparkonto")
    connection = await _connection(save_fixture, user.id, bank_account=checking, import_from=date(2026, 10, 1))
    await save_fixture(BankConnectionAccount(connection_id=connection.id, identification_hash="hash-2", uid="uid-2", currency="SEK"))
    bank.transactions["uid-1"] = []
    bank.transactions["uid-2"] = [transaction("s1", date(2026, 3, 1), "1000.00", credit=True, text="Ränta")]
    await open_banking_service.sync(session_maker, connection.id)

    second = (await client.get("/v1/bank-connections")).json()["connections"][0]["accounts"][1]["id"]
    await client.patch(f"/v1/bank-connections/accounts/{second}", json={"bank_account_id": str(savings.id)})
    await open_banking_service.sync(session_maker, connection.id)

    assert await _transactions(session, savings) == [(date(2026, 3, 1), 100000, TransactionDirection.credit, "Ränta")]

  @pytest.mark.asyncio
  async def test_relinking_reads_back_to_the_new_accounts_start(
    self,
    client: AsyncClient,
    session: AsyncSession,
    session_maker: SessionMaker,
    save_fixture: SaveFixture,
    configured: None,
    bank: FakeEnableBanking,
    user: User,
    job_queue_manager: JobQueueManager,
  ) -> None:
    first, other = await _bank_account(save_fixture, user.id), await _bank_account(save_fixture, user.id, "Other")
    connection = await _connection(save_fixture, user.id, bank_account=first, import_from=TODAY)
    bank.transactions["uid-1"] = [transaction("r1", date(2026, 5, 1), "-20.00")]
    await open_banking_service.sync(session_maker, connection.id)

    account_id = (await client.get("/v1/bank-connections")).json()["connections"][0]["accounts"][0]["id"]
    await client.patch(f"/v1/bank-connections/accounts/{account_id}", json={"bank_account_id": str(other.id)})
    await open_banking_service.sync(session_maker, connection.id)

    assert bank.transaction_requests[-1]["date_from"] == (TODAY - timedelta(days=365)).isoformat()
    assert len(await _transactions(session, other)) == 1

  @pytest.mark.asyncio
  async def test_one_account_failing_doesnt_stop_the_others(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    checking, savings = await _bank_account(save_fixture, user.id), await _bank_account(save_fixture, user.id, "Sparkonto")
    connection = await _connection(save_fixture, user.id, bank_account=checking, import_from=date(2026, 10, 1))
    await save_fixture(
      BankConnectionAccount(
        connection_id=connection.id, identification_hash="hash-2", uid="uid-gone", currency="SEK", bank_account_id=savings.id, import_from=date(2026, 10, 1)
      )
    )
    bank.transactions["uid-1"] = [transaction("r1", date(2026, 10, 2), "-20.00")]

    await open_banking_service.sync(session_maker, connection.id)

    assert len(await _transactions(session, checking)) == 1
    stored = await BankConnectionRepository.from_session(session).get_with_accounts(connection.id)
    assert stored is not None
    assert [a.last_synced_at for a in stored.accounts] == [NOW, None]
    assert stored.sync_error == "Couldn't reach Skandia. Bessel tries again at the next sync."
    assert stored.last_synced_at == NOW

  @pytest.mark.asyncio
  async def test_accounts_left_out_of_a_renewal_are_no_longer_read(
    self,
    client: AsyncClient,
    session: AsyncSession,
    session_maker: SessionMaker,
    save_fixture: SaveFixture,
    configured: None,
    bank: FakeEnableBanking,
    user: User,
    job_queue_manager: JobQueueManager,
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, uid="old-uid", bank_account=bank_account, import_from=TODAY)
    bank.approvals["code-2"] = (VALID_UNTIL, [account("uid-2", "hash-2", name="Sparkonto")])

    body = (await client.post("/v1/bank-connections/callback", json={"code": "code-2", "state": _state(user.id)})).json()
    await open_banking_service.sync(session_maker, connection.id)

    assert [(a["name"], a["shared"]) for a in body["accounts"]] == [("Allkonto", False), ("Sparkonto", True)]
    assert bank.transaction_requests == []
    stored = await BankConnectionRepository.from_session(session).get_by_id(connection.id)
    assert stored is not None and stored.sync_error is None

  @pytest.mark.asyncio
  async def test_unlinked_accounts_are_not_read(
    self, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    connection = await _connection(save_fixture, user.id)

    await open_banking_service.sync(session_maker, connection.id)

    assert bank.transaction_requests == []

  @pytest.mark.asyncio
  async def test_an_ended_approval_is_shown_on_the_connection(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, bank_account=bank_account, import_from=TODAY)
    bank.expired.add("uid-1")

    await open_banking_service.sync(session_maker, connection.id)

    refreshed = await BankConnectionRepository.from_session(session).get_by_id(connection.id)
    assert refreshed is not None
    assert refreshed.sync_error == "Skandia's approval has ended. Renew it with BankID."
    assert refreshed.last_synced_at is None

  @pytest.mark.asyncio
  async def test_past_its_end_date_the_bank_is_not_asked(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, bank_account=bank_account, import_from=TODAY)
    connection.valid_until = NOW - timedelta(minutes=1)

    await open_banking_service.sync(session_maker, connection.id)

    assert bank.transaction_requests == []
    assert connection.sync_error == "Skandia's approval has ended. Renew it with BankID."

  @pytest.mark.asyncio
  async def test_bank_errors_are_recorded_not_raised(
    self, session: AsyncSession, session_maker: SessionMaker, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    connection = await _connection(save_fixture, user.id, bank_account=bank_account, import_from=TODAY)

    await open_banking_service.sync(session_maker, connection.id)

    assert connection.sync_error == "Couldn't reach Skandia. Bessel tries again at the next sync."


class TestExpiryWarning:
  @pytest.mark.asyncio
  async def test_warns_once_two_weeks_before_the_approval_ends(self, session: AsyncSession, save_fixture: SaveFixture, user: User) -> None:
    connection = await _connection(save_fixture, user.id)
    connection.valid_until = NOW + timedelta(days=15)

    assert await open_banking_service.warn_before_expiry(session, connection, now=NOW) is False
    soon = NOW + timedelta(days=2)
    assert await open_banking_service.warn_before_expiry(session, connection, now=soon) is True
    assert await open_banking_service.warn_before_expiry(session, connection, now=soon + timedelta(hours=12)) is False
    await session.flush()

    [notification] = (await session.execute(select(Notification).where(Notification.user_id == user.id))).scalars().all()
    assert notification.title == "Renew Skandia access"
    assert notification.body == "Bessel can read Skandia until 5 November. Approve again with BankID to keep transactions importing."
    assert (notification.link, notification.kind) == ("/accounts", "warning")


class TestDisconnect:
  @pytest.mark.asyncio
  async def test_disconnecting_closes_the_session_and_keeps_transactions(
    self, client: AsyncClient, session: AsyncSession, save_fixture: SaveFixture, configured: None, bank: FakeEnableBanking, user: User
  ) -> None:
    bank_account = await _bank_account(save_fixture, user.id)
    await _hand_imported(save_fixture, bank_account, TODAY, 100)
    connection = await _connection(save_fixture, user.id, bank_account=bank_account, import_from=TODAY)

    assert (await client.delete(f"/v1/bank-connections/{connection.id}")).status_code == 204

    assert bank.deleted_sessions == ["session-old"]
    assert (await session.execute(select(BankConnectionAccount))).scalars().all() == []
    assert len(await _transactions(session, bank_account)) == 1


def test_redirect_url_override_wins(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(settings, "ENABLE_BANKING_REDIRECT_URL", "http://127.0.0.1:3001/bank-connections/callback")
  assert settings.enable_banking_redirect_url() == "http://127.0.0.1:3001/bank-connections/callback"


def test_private_key_can_be_read_from_a_file(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
  key_file = tmp_path / "key.pem"
  key_file.write_text(PRIVATE_KEY)
  monkeypatch.setattr(settings, "ENABLE_BANKING_PRIVATE_KEY_PATH", str(key_file))
  assert settings.enable_banking_private_key() == PRIVATE_KEY


def test_syncs_at_six_morning_and_evening_stockholm_time() -> None:
  [trigger] = [t for send, t in scheduler_middleware.cron_triggers if send.__self__.actor_name == tasks.sync_all_bank_connections.__name__]
  # Without a timezone the trigger runs in the machine's own; CI and production run in UTC.
  assert str(trigger.timezone) == "Europe/Stockholm"
  summer_midnight = datetime(2026, 7, 1, tzinfo=ZoneInfo("Europe/Stockholm"))
  morning = trigger.get_next_fire_time(None, summer_midnight)
  assert morning is not None
  evening = trigger.get_next_fire_time(morning, morning + timedelta(minutes=1))
  assert evening is not None
  assert morning.astimezone(UTC) == datetime(2026, 7, 1, 4, tzinfo=UTC)
  assert evening.astimezone(UTC) == datetime(2026, 7, 1, 16, tzinfo=UTC)
