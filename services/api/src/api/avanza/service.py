import hashlib
import json
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

import structlog

from api.avanza import parsing
from api.avanza.repository import (
  AvanzaAccountRepository,
  AvanzaConnectionRepository,
  HoldingSnapshotRepository,
  ImportedTradeRepository,
  SecurityCatalogRepository,
)
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

log: Logger = structlog.get_logger()

# Every import reads this far back again, for rows that settle late.
OVERLAP = timedelta(days=14)
# Avanza's first transaction can't be older than this; the first import starts here.
EARLIEST = date(2000, 1, 1)
HASH_PREFIX = "av:"
REJECTED = "Avanza didn't accept the login. Sign in again in the Bessel desktop app."
UNREACHABLE = "Couldn't reach Avanza. The desktop app tries again later."

type SyncFailure = Literal["rejected", "unreachable"]


class AvanzaConflictError(Exception):
  """The Bessel account already takes another Avanza account's transactions."""


class AvanzaDataError(Exception):
  """The uploaded Avanza responses don't have the shape Bessel reads."""


def available_to(user_id: UUID) -> bool:
  return user_id in settings.AVANZA_USER_IDS


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
  positions: list[parsing.Position] | None
  movements: list[parsing.Movement]


def parse(overview: dict[str, Any], positions: dict[str, Any] | None, transactions: list[dict[str, Any]]) -> Fetched:
  """Avanza's raw responses as plain values; overlapping transaction pages count each row once."""
  try:
    unique = {m.external_id: m for body in transactions for m in parsing.movements(body)}
    return Fetched(
      accounts=parsing.accounts(overview),
      positions=parsing.positions(positions) if positions is not None else None,
      movements=list(unique.values()),
    )
  except (KeyError, ValueError, TypeError, AttributeError) as e:
    raise AvanzaDataError(type(e).__name__) from e


class AvanzaService:
  async def import_data(
    self, connections: AvanzaConnectionRepository, user_id: UUID, *, username: str, fetched: Fetched, fetched_from: date | None
  ) -> AvanzaConnection:
    """Imports what the desktop app read from Avanza into every linked account the upload reaches back far enough for.

    An account whose history starts before `fetched_from` (linked after the app asked where to start) waits for the next
    upload, which reads far enough back for it."""
    now = utc_now()
    connection = await connections.get_for_user(user_id)
    if connection is None:
      connection = await connections.create(AvanzaConnection(user_id=user_id, username=username, accounts=[]))
    connection.username = username
    self._merge_accounts(connection, fetched.accounts)
    await connections.session.flush()

    by_external_id = {account.external_id: account for account in connection.accounts}
    created, imported, waiting = 0, 0, 0
    for account in self.linked(connection):
      if fetched_from is None or fetched.positions is None or account.date_from < fetched_from:
        waiting += 1
        continue
      created += await self.import_account(connections.session, user_id, account, fetched, today=now.date())
      by_external_id[account.external_id].last_synced_at = now
      imported += 1
    connection.last_synced_at = now
    connection.sync_error, connection.credentials_rejected_at, connection.stale_notified_at = None, None, None
    await connections.session.flush()
    log.info("avanza_imported", connection_id=str(connection.id), accounts=imported, waiting=waiting, created=created)
    return connection

  def report_failure(self, connection: AvanzaConnection, reason: SyncFailure) -> None:
    """Records why the desktop app couldn't read Avanza; a rejected login asks the user to sign in again."""
    if reason == "rejected":
      connection.sync_error, connection.credentials_rejected_at = REJECTED, utc_now()
    else:
      connection.sync_error = UNREACHABLE

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

  async def link_account(self, session: AsyncSession, account: AvanzaAccount, bank_account: BankAccount | None) -> None:
    """Points the Avanza account at a Bessel account; the next import reads its whole history."""
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
    for p in fetched.positions or []:
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

  def sync_from(self, connection: AvanzaConnection) -> date | None:
    """The first day the next upload needs, for the linked account furthest behind."""
    return min((account.date_from for account in self.linked(connection)), default=None)


avanza_service = AvanzaService()
