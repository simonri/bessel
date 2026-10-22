from datetime import UTC, datetime, timedelta

import pytest
from api.common.encryption import encrypt
from api.models.avanza import AvanzaAccount, AvanzaConnection
from api.models.bank_account import BankAccount
from api.models.bank_connection import BankConnection, BankConnectionAccount
from api.models.notification import Notification
from api.models.user import User
from api.postgres import AsyncSession
from api.sync_health.service import warn_stale
from api.tests.fixtures.database import SaveFixture
from cryptography.fernet import Fernet
from sqlalchemy import select

NOW = datetime(2026, 10, 21, 12, tzinfo=UTC)


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
  from api.settings import settings

  monkeypatch.setattr(settings, "CREDENTIALS_ENCRYPTION_KEY", Fernet.generate_key().decode())


async def _bank_account(save_fixture: SaveFixture, user: User) -> BankAccount:
  bank_account = BankAccount(name="Checking", currency="SEK", base_balance=0, subtype="checking", user_id=user.id)
  await save_fixture(bank_account)
  return bank_account


async def _bank(
  save_fixture: SaveFixture, user: User, name: str, synced: datetime | None, *, linked: BankAccount | None, shared: bool = True
) -> BankConnection:
  connection = BankConnection(
    user_id=user.id, bank_name=name, bank_country="SE", encrypted_session_id=encrypt("s"), valid_until=NOW + timedelta(days=90), last_synced_at=synced
  )
  await save_fixture(connection)
  await save_fixture(
    BankConnectionAccount(
      connection_id=connection.id,
      identification_hash=f"h-{name}",
      uid=f"u-{name}",
      currency="SEK",
      bank_account_id=linked.id if linked else None,
      shared=shared,
    )
  )
  return connection


async def _warnings(session: AsyncSession, user: User) -> list[str]:
  return [n.title for n in (await session.execute(select(Notification).where(Notification.user_id == user.id))).scalars().all()]


class TestStaleSyncs:
  @pytest.mark.asyncio
  async def test_warns_once_about_each_linked_connection_that_stopped_syncing(self, session: AsyncSession, save_fixture: SaveFixture, user: User) -> None:
    checking = await _bank_account(save_fixture, user)
    await _bank(save_fixture, user, "Skandia", NOW - timedelta(hours=37), linked=checking)
    await _bank(save_fixture, user, "Klarna", NOW - timedelta(hours=35), linked=checking)
    await _bank(save_fixture, user, "Revolut", NOW - timedelta(days=30), linked=None)
    # Left out of the latest approval, so it isn't read anyway; Accounts already says so.
    await _bank(save_fixture, user, "Lunar", NOW - timedelta(days=30), linked=checking, shared=False)
    avanza = AvanzaConnection(user_id=user.id, username="simon", encrypted_credentials=encrypt("{}"), last_synced_at=NOW - timedelta(days=3))
    await save_fixture(avanza)
    other = await _bank_account(save_fixture, user)
    await save_fixture(AvanzaAccount(connection_id=avanza.id, external_id="1", name="ISK", account_type="INVESTERINGSSPARKONTO", bank_account_id=other.id))

    assert await warn_stale(session, now=NOW) == 2
    assert await warn_stale(session, now=NOW + timedelta(minutes=30)) == 0
    await session.flush()

    assert sorted(await _warnings(session, user)) == ["Avanza has stopped syncing", "Skandia has stopped syncing"]

  @pytest.mark.asyncio
  async def test_a_connection_that_never_synced_counts_from_when_it_was_made(self, session: AsyncSession, save_fixture: SaveFixture, user: User) -> None:
    connection = await _bank(save_fixture, user, "Marginalen Bank", None, linked=await _bank_account(save_fixture, user))
    made = connection.created_at

    assert await warn_stale(session, now=made + timedelta(hours=35)) == 0
    assert await warn_stale(session, now=made + timedelta(hours=37)) == 1
