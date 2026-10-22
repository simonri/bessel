import hashlib
import json
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import httpx
import structlog

from api.avanza import client as avanza_client
from api.avanza import parsing
from api.avanza.client import AvanzaAuthError, AvanzaClient, AvanzaError
from api.avanza.repository import (
  AvanzaAccountRepository,
  AvanzaConnectionRepository,
  HoldingSnapshotRepository,
  ImportedTradeRepository,
  SecurityCatalogRepository,
)
from api.common.encryption import decrypt, encrypt
from api.common.utils import utc_now
from api.logging import Logger
from api.models.avanza import AvanzaAccount, AvanzaConnection
from api.models.bank_account import BankAccount
from api.models.trade import TradeType
from api.models.transaction import TransactionDirection
from api.postgres import AsyncSession
from api.settings import settings
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.service import transaction_service
from api.worker import enqueue_job

log: Logger = structlog.get_logger()

type SessionMaker = Callable[[], AbstractAsyncContextManager[AsyncSession]]

SYNC_ACTOR = "sync_avanza_connection"
# Every sync is a full login, so "Sync now" waits this long after the last one.
SYNC_COOLDOWN = timedelta(minutes=10)
# Every sync reads this far back again, for rows that settle late.
OVERLAP = timedelta(days=14)
# Avanza's first transaction can't be older than this; the first import starts here.
EARLIEST = date(2000, 1, 1)
# The most transactions asked for at once; a window that fills it is split in two.
PAGE_LIMIT = 1000
HASH_PREFIX = "av:"
REJECTED = "Avanza didn't accept the login. Save new credentials to resume syncing."
UNREACHABLE = "Couldn't reach Avanza. Bessel tries again at the next sync."


class AvanzaConflictError(Exception):
  """The Bessel account already takes another Avanza account's transactions."""


def available_to(user_id: UUID) -> bool:
  return user_id in settings.AVANZA_USER_IDS


def _credentials(connection: AvanzaConnection) -> tuple[str, str, str]:
  secret = json.loads(decrypt(connection.encrypted_credentials))
  return connection.username, secret["password"], secret["totpSecret"]


def _minor(amount: Decimal) -> int:
  return int((amount * 100).to_integral_value())


def _micro(quantity: Decimal) -> int:
  return int((quantity * 1_000_000).to_integral_value())


def cash_hash(account_id: str, movement_id: str) -> str:
  return HASH_PREFIX + hashlib.sha256(f"{account_id}:{movement_id}".encode()).hexdigest()


@dataclass(frozen=True, slots=True)
class LinkedAccount:
  external_id: str
  bank_account_id: UUID
  date_from: date


@dataclass(frozen=True, slots=True)
class Fetched:
  accounts: list[parsing.Account]
  positions: list[parsing.Position]
  movements: list[parsing.Movement]


async def _all_movements(client: AvanzaClient, date_from: date, date_to: date) -> list[parsing.Movement]:
  """Every transaction in the window; Avanza caps a response, so a full one is split until none are."""
  body = await client.transactions(date_from=date_from, date_to=date_to, max_elements=PAGE_LIMIT)
  rows = parsing.movements(body)
  if len(rows) < PAGE_LIMIT:
    return rows
  if date_from >= date_to:
    raise AvanzaError(f"More than {PAGE_LIMIT} transactions on {date_from}.")
  middle = date_from + (date_to - date_from) / 2
  return await _all_movements(client, date_from, middle) + await _all_movements(client, middle + timedelta(days=1), date_to)


class AvanzaService:
  async def connect(self, connections: AvanzaConnectionRepository, user_id: UUID, *, username: str, password: str, totp_secret: str) -> AvanzaConnection:
    """Checks the login with Avanza, then stores it encrypted along with the accounts it can see."""
    totp_secret = totp_secret.replace(" ", "").upper()
    async with avanza_client.http_client() as http:
      client = AvanzaClient(http)
      await client.login(username, password, totp_secret)
      found = parsing.accounts(await client.overview())

    connection = await connections.get_for_user(user_id)
    if connection is None:
      connection = AvanzaConnection(user_id=user_id, username=username, encrypted_credentials="", accounts=[])
      await connections.create(connection)
    connection.username = username
    connection.encrypted_credentials = encrypt(json.dumps({"password": password, "totpSecret": totp_secret}))
    connection.credentials_rejected_at, connection.sync_error = None, None
    self._merge_accounts(connection, found)
    await connections.session.flush()
    return connection

  def _merge_accounts(self, connection: AvanzaConnection, found: list[parsing.Account]) -> None:
    known = {account.external_id: account for account in connection.accounts}
    for account in found:
      existing = known.get(account.external_id)
      if existing is None:
        connection.accounts.append(
          AvanzaAccount(external_id=account.external_id, name=account.name, account_type=account.account_type, cash_balance=_minor(account.cash))
        )
      else:
        existing.name, existing.account_type, existing.cash_balance = account.name, account.account_type, _minor(account.cash)

  def request_sync(self, connection_id: UUID) -> None:
    enqueue_job(SYNC_ACTOR, str(connection_id))

  def can_sync_now(self, connection: AvanzaConnection, *, now: datetime) -> bool:
    return connection.last_synced_at is None or now - connection.last_synced_at >= SYNC_COOLDOWN

  async def link_account(self, session: AsyncSession, account: AvanzaAccount, bank_account: BankAccount | None) -> None:
    """Points the Avanza account at a Bessel account; the next sync imports its whole history."""
    if (bank_account.id if bank_account else None) == account.bank_account_id:
      return
    if bank_account is not None and await AvanzaAccountRepository.from_session(session).is_linked_elsewhere(bank_account.id, account):
      raise AvanzaConflictError("That Bessel account already imports another Avanza account.")
    account.bank_account_id = bank_account.id if bank_account else None
    account.last_synced_at = None

  def linked(self, connection: AvanzaConnection) -> list[LinkedAccount]:
    return [
      LinkedAccount(
        external_id=account.external_id,
        bank_account_id=account.bank_account_id,
        date_from=(account.last_synced_at - OVERLAP).date() if account.last_synced_at else EARLIEST,
      )
      for account in connection.accounts
      if account.bank_account_id is not None
    ]

  async def fetch(self, username: str, password: str, totp_secret: str, *, date_from: date, today: date) -> Fetched:
    async with avanza_client.http_client() as http:
      client = AvanzaClient(http)
      await client.login(username, password, totp_secret)
      found = parsing.accounts(await client.overview())
      held = parsing.positions(await client.positions())
      moved = await _all_movements(client, date_from, today)
    return Fetched(accounts=found, positions=held, movements=moved)

  async def import_account(self, session: AsyncSession, user_id: UUID, account: LinkedAccount, fetched: Fetched, *, today: date) -> int:
    """Cash movements into the account's transactions, buys and sells into trades, and today's positions."""
    securities = SecurityCatalogRepository.from_session(session)
    movements = [m for m in fetched.movements if m.account_id == account.external_id and m.settled and m.day >= account.date_from]

    cash = [
      ParsedTransaction(
        transaction_date=m.day,
        amount_minor=abs(_minor(m.amount)),
        currency=m.currency,
        direction=TransactionDirection.credit if m.amount > 0 else TransactionDirection.debit,
        dedup_hash=cash_hash(account.external_id, m.external_id),
        description=m.description,
        raw_data={"id": m.external_id, "type": m.type, "amount": str(m.amount), "description": m.description},
        transaction_type=m.type,
      )
      for m in movements
      if m.amount != 0
    ]
    created, _ = await transaction_service.import_transactions(
      session,
      bank_account_id=account.bank_account_id,
      bank_name="avanza",
      file_format="api",
      raw_content=json.dumps([t.raw_data for t in cash]),
      parsed=cash,
      user_id=user_id,
    )

    trades = []
    for m in movements:
      if m.type not in parsing.TRADE_TYPES or m.instrument is None or not m.quantity or m.price is None:
        continue
      security = await securities.get_or_create_by_isin(
        isin=m.instrument.isin, name=m.instrument.name, asset_type=m.instrument.asset_type, currency=m.instrument.currency
      )
      trades.append(
        {
          "user_id": user_id,
          "security_id": security.id,
          "bank_account_id": account.bank_account_id,
          "trade_type": TradeType.buy if m.type == "BUY" else TradeType.sell,
          "trade_date": m.day,
          "quantity": abs(_micro(m.quantity)),
          "price_per_unit": _minor(m.price),
          "currency": m.price_currency or m.instrument.currency,
          "notes": f"Courtage {m.commission} {m.currency}" if m.commission else None,
          "external_id": f"avanza:{m.external_id}",
        }
      )
    await ImportedTradeRepository.from_session(session).insert_ignoring_duplicates(trades)

    snapshot = []
    for p in fetched.positions:
      if p.account_id != account.external_id or p.quantity == 0:
        continue
      security = await securities.get_or_create_by_isin(
        isin=p.instrument.isin, name=p.instrument.name, asset_type=p.instrument.asset_type, currency=p.instrument.currency
      )
      snapshot.append(
        {
          "user_id": user_id,
          "bank_account_id": account.bank_account_id,
          "security_id": security.id,
          "snapshot_date": today,
          "quantity": _micro(p.quantity),
          "value": _minor(p.value),
          "acquired_value": _minor(p.acquired_value),
          "currency": p.currency,
        }
      )
    await HoldingSnapshotRepository.from_session(session).replace_day(account.bank_account_id, today, snapshot)
    return created

  async def sync(self, session_maker: SessionMaker, connection_id: UUID) -> None:
    """Imports every linked account; a rejected login stops syncing until new credentials are saved."""
    async with session_maker() as session:
      connection = await AvanzaConnectionRepository.from_session(session).get_with_accounts(connection_id)
      if connection is None or connection.credentials_rejected_at is not None:
        return
      user_id, credentials, linked = connection.user_id, _credentials(connection), self.linked(connection)

    started = utc_now()
    today = started.date()
    try:
      fetched = await self.fetch(*credentials, date_from=min((a.date_from for a in linked), default=today), today=today)
    except AvanzaAuthError:
      await self._record(session_maker, connection_id, error=REJECTED, rejected_at=started)
      return
    except (AvanzaError, httpx.HTTPError, KeyError, ValueError) as e:
      # Only the error's class: Avanza's errors can carry account details.
      log.warning("avanza_sync_failed", connection_id=str(connection_id), error=type(e).__name__)
      await self._record(session_maker, connection_id, error=UNREACHABLE)
      return

    async with session_maker() as session:
      connection = await AvanzaConnectionRepository.from_session(session).get_with_accounts(connection_id)
      if connection is None:
        return
      self._merge_accounts(connection, fetched.accounts)
      by_external_id = {account.external_id: account for account in connection.accounts}
      created = 0
      for account in linked:
        created += await self.import_account(session, user_id, account, fetched, today=today)
        stored = by_external_id.get(account.external_id)
        if stored is not None:
          stored.last_synced_at = started
      connection.last_synced_at, connection.sync_error, connection.stale_notified_at = started, None, None
    log.info("avanza_synced", connection_id=str(connection_id), created=created)

  async def _record(self, session_maker: SessionMaker, connection_id: UUID, *, error: str, rejected_at: datetime | None = None) -> None:
    async with session_maker() as session:
      connection = await AvanzaConnectionRepository.from_session(session).get_by_id(connection_id)
      if connection is not None:
        connection.sync_error = error
        if rejected_at is not None:
          connection.credentials_rejected_at = rejected_at


avanza_service = AvanzaService()
