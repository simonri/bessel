import hashlib
import json
import secrets
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

import httpx
import structlog

from api.avanza.repository import HoldingSnapshotRepository, ImportedTradeRepository, SecurityCatalogRepository
from api.common.encryption import InvalidToken, decrypt, encrypt
from api.common.utils import utc_now
from api.logging import Logger
from api.models.bank_account import BankAccount
from api.models.montrose import MontroseAccount, MontroseConnection
from api.models.trade import TradeType
from api.models.transaction import TransactionDirection
from api.montrose import client as montrose
from api.montrose import parsing
from api.montrose.client import McpSession, MontroseAuthError, MontroseError, RegisteredClient, Tokens
from api.montrose.repository import MontroseAccountRepository, MontroseConnectionRepository
from api.postgres import AsyncSession
from api.settings import settings
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.service import transaction_service
from api.worker import enqueue_job

log: Logger = structlog.get_logger()

type SessionMaker = Callable[[], AbstractAsyncContextManager[AsyncSession]]

SYNC_ACTOR = "sync_montrose_connection"
SYNC_COOLDOWN = timedelta(minutes=2)
STATE_TTL_SECONDS = 15 * 60
# Montrose lets the refresh token roll for 90 days after the BankID consent.
CONSENT_LIFETIME = timedelta(days=90)
# An access token this close to running out is refreshed before use.
REFRESH_MARGIN = timedelta(minutes=1)
# Montrose's own app icon, from its website.
LOGO = "https://cdn.prod.website-files.com/665d843245a09dc69c336e03/667abad232482d4a92203115_webclip.png"
# Montrose leaves the name empty unless the user named the account; these read like its own labels.
TYPE_NAMES = {"ISK": "ISK", "KF": "KF", "Depot": "Depå", "SPAR": "Sparkonto", "Credit": "Kredit"}
REJECTED = "Montrose no longer accepts Bessel's access. Log in with BankID again to resume syncing."
UNREACHABLE = "Couldn't reach Montrose. Bessel tries again at the next sync."
# Every sync reads this far back again, for rows that settle late.
OVERLAP = timedelta(days=14)
# The first import of an account starts here, which covers its whole history.
EARLIEST = date(2000, 1, 1)
PAGE_SIZE = 50
# A guard against a cursor that never ends; at 50 rows a page this is 50,000 transactions.
MAX_PAGES = 1000
HASH_PREFIX = "mt:"


class MontroseStateError(Exception):
  """The callback doesn't belong to a login this user started, or it came too late."""


class MontroseConflictError(Exception):
  """The Bessel account already takes another Montrose account's transactions."""


@dataclass(frozen=True, slots=True)
class Instrument:
  name: str
  ticker: str


@dataclass(frozen=True, slots=True)
class LinkedAccount:
  external_id: str
  bank_account_id: UUID
  date_from: date


@dataclass(frozen=True, slots=True)
class Fetched:
  accounts: list["Account"]
  movements: list[parsing.Movement]
  holdings: list[parsing.Holdings]
  instruments: dict[int, Instrument]


@dataclass(frozen=True, slots=True)
class Account:
  external_id: str
  account_number: str
  name: str
  account_type: str


def redirect_uri() -> str:
  return settings.generate_frontend_url("montrose/callback")


def _name(row: dict[str, Any]) -> str:
  given = str(row.get("accountName") or "").strip()
  account_type = str(row["accountType"])
  return given or f"Montrose - {TYPE_NAMES.get(account_type, account_type)}"


def parse_accounts(rows: Any) -> list[Account]:
  return [
    Account(external_id=str(row["accountId"]), account_number=str(row["accountNumber"]), name=_name(row), account_type=str(row["accountType"])) for row in rows
  ]


def _client(connection: MontroseConnection) -> RegisteredClient:
  stored = json.loads(decrypt(connection.encrypted_client))
  return RegisteredClient(client_id=stored["client_id"], client_secret=stored["client_secret"])


def _store_tokens(connection: MontroseConnection, tokens: Tokens, *, now: datetime) -> None:
  connection.encrypted_tokens = encrypt(json.dumps({"access_token": tokens.access_token, "refresh_token": tokens.refresh_token}))
  connection.access_expires_at = now + timedelta(seconds=tokens.expires_in)


def consent_expires_at(connection: MontroseConnection) -> datetime:
  return connection.consented_at + CONSENT_LIFETIME


def _minor(amount: Decimal) -> int:
  return int((amount * 100).to_integral_value())


def _micro(quantity: Decimal) -> int:
  return int((quantity * 1_000_000).to_integral_value())


def cash_hash(account_id: str, movement_id: str) -> str:
  return HASH_PREFIX + hashlib.sha256(f"{account_id}:{movement_id}".encode()).hexdigest()


async def fetch(session: McpSession, *, account_ids: list[str], date_from: date) -> Fetched:
  """The accounts, the linked accounts' transactions since `date_from`, their holdings, and a name for every instrument they touch."""
  found = parse_accounts(await session.call_tool("get_user_accounts"))
  if not account_ids:
    return Fetched(accounts=found, movements=[], holdings=[], instruments={})
  rows: list[dict[str, Any]] = []
  cursor = None
  for _ in range(MAX_PAGES):
    arguments = {"accountIds": account_ids, "from": date_from.isoformat(), "pageSize": PAGE_SIZE} | ({"cursor": cursor} if cursor else {})
    page = await session.call_tool("get_transactions", arguments)
    rows += page["transactions"]
    cursor = (page.get("pagination") or {}).get("nextCursor")
    if not cursor:
      break
  else:
    raise MontroseError("Montrose kept returning more pages of transactions.")
  moved = parsing.movements(rows)
  held = [h for h in parsing.holdings(await session.call_tool("get_holdings")) if h.account_id in account_ids]
  instruments = {p.orderbook_id: Instrument(name=p.name, ticker=p.ticker) for h in held for p in h.positions if p.orderbook_id}
  for orderbook_id in sorted({m.orderbook_id for m in moved if m.orderbook_id} - instruments.keys()):
    matches = await session.call_tool("search_instruments", {"orderbookId": orderbook_id})
    if matches:
      instruments[orderbook_id] = Instrument(name=str(matches[0]["name"]), ticker=str(matches[0].get("ticker") or ""))
  return Fetched(accounts=found, movements=moved, holdings=held, instruments=instruments)


class MontroseService:
  async def start(self, user_id: UUID) -> str:
    """Registers Bessel with Montrose and returns the BankID login; the callback's state carries what finishing needs."""
    async with montrose.http_client() as http:
      registered = await montrose.register_client(http, redirect_uri=redirect_uri())
    pkce = montrose.new_pkce()
    state = encrypt(
      json.dumps(
        {
          "user_id": str(user_id),
          "client_id": registered.client_id,
          "client_secret": registered.client_secret,
          "verifier": pkce.verifier,
          "nonce": secrets.token_urlsafe(8),
        }
      )
    )
    return montrose.authorize_url(registered, redirect_uri=redirect_uri(), state=state, code_challenge=pkce.challenge)

  async def complete(
    self, connections: MontroseConnectionRepository, user_id: UUID, *, code: str, state: str, issuer: str | None, now: datetime
  ) -> MontroseConnection:
    """Exchanges the BankID consent for tokens and reads which accounts it covers."""
    try:
      payload = json.loads(decrypt(state, ttl=STATE_TTL_SECONDS))
    except (InvalidToken, ValueError) as e:
      raise MontroseStateError("The Montrose login expired. Start again from Bessel.") from e
    if payload.get("user_id") != str(user_id) or (issuer is not None and issuer != montrose.BASE_URL):
      raise MontroseStateError("This Montrose login wasn't started from your Bessel account.")
    registered = RegisteredClient(client_id=payload["client_id"], client_secret=payload["client_secret"])

    async with montrose.http_client() as http:
      tokens = await montrose.exchange_code(http, registered, code=code, code_verifier=payload["verifier"], redirect_uri=redirect_uri())
      session = McpSession(http, tokens.access_token)
      await session.initialize()
      found = parse_accounts(await session.call_tool("get_user_accounts"))

    connection = await connections.get_for_user(user_id)
    if connection is None:
      connection = MontroseConnection(user_id=user_id, encrypted_client="", encrypted_tokens="", access_expires_at=now, consented_at=now, accounts=[])
      await connections.create(connection)
    connection.encrypted_client = encrypt(json.dumps({"client_id": registered.client_id, "client_secret": registered.client_secret}))
    _store_tokens(connection, tokens, now=now)
    connection.consented_at, connection.rejected_at, connection.sync_error = now, None, None
    self._merge_accounts(connection, found)
    await connections.session.flush()
    return connection

  def _merge_accounts(self, connection: MontroseConnection, found: list[Account]) -> None:
    known = {account.external_id: account for account in connection.accounts}
    for account in found:
      existing = known.get(account.external_id)
      if existing is None:
        connection.accounts.append(
          MontroseAccount(external_id=account.external_id, account_number=account.account_number, name=account.name, account_type=account.account_type)
        )
      else:
        existing.account_number, existing.name, existing.account_type = account.account_number, account.name, account.account_type

  async def access_token(self, session_maker: SessionMaker, connection_id: UUID, *, now: datetime) -> str:
    """A usable access token. When it's about to run out it is refreshed and saved at once, under a row lock:
    Montrose may rotate the refresh token, and losing the new one ends the consent."""
    rejected = False
    async with session_maker() as session:
      connection = await MontroseConnectionRepository.from_session(session).get_locked(connection_id)
      if connection is None or connection.rejected_at is not None:
        raise MontroseAuthError("not connected")
      tokens = json.loads(decrypt(connection.encrypted_tokens))
      if connection.access_expires_at - now > REFRESH_MARGIN:
        return tokens["access_token"]
      try:
        async with montrose.http_client() as http:
          fresh = await montrose.refresh(http, _client(connection), refresh_token=tokens["refresh_token"])
      except MontroseAuthError:
        connection.rejected_at, connection.sync_error = now, REJECTED
        rejected = True
      else:
        _store_tokens(connection, fresh, now=now)
    if rejected:
      raise MontroseAuthError("refresh rejected")
    return fresh.access_token

  def request_sync(self, connection_id: UUID) -> None:
    enqueue_job(SYNC_ACTOR, str(connection_id))

  def can_sync_now(self, connection: MontroseConnection, *, now: datetime) -> bool:
    return connection.last_synced_at is None or now - connection.last_synced_at >= SYNC_COOLDOWN

  async def link_account(self, session: AsyncSession, account: MontroseAccount, bank_account: BankAccount | None) -> None:
    """Points the Montrose account at a Bessel account; the next sync imports its whole history."""
    if (bank_account.id if bank_account else None) == account.bank_account_id:
      return
    if bank_account is not None and await MontroseAccountRepository.from_session(session).is_linked_elsewhere(bank_account.id, account):
      raise MontroseConflictError("That Bessel account already imports another Montrose account.")
    account.bank_account_id = bank_account.id if bank_account else None
    account.last_synced_at = None

  def linked(self, connection: MontroseConnection) -> list[LinkedAccount]:
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
    movements = [m for m in fetched.movements if m.account_id == account.external_id and m.day >= account.date_from]

    def instrument_name(movement: parsing.Movement) -> str | None:
      instrument = fetched.instruments.get(movement.orderbook_id)
      return instrument.name if instrument else None

    cash = [
      ParsedTransaction(
        transaction_date=m.day,
        amount_minor=abs(_minor(m.amount)),
        currency=m.currency,
        direction=TransactionDirection.credit if m.amount > 0 else TransactionDirection.debit,
        dedup_hash=cash_hash(account.external_id, m.external_id),
        description=m.description(instrument_name(m)),
        raw_data={"id": m.external_id, "category": m.category, "amount": str(m.amount), "currency": m.currency, "text": m.text},
        transaction_type=m.transaction_type,
      )
      for m in movements
      if m.moves_cash
    ]
    created, _ = await transaction_service.import_transactions(
      session,
      bank_account_id=account.bank_account_id,
      bank_name="montrose",
      file_format="api",
      raw_content=json.dumps([t.raw_data for t in cash]),
      parsed=cash,
      user_id=user_id,
    )

    securities = SecurityCatalogRepository.from_session(session)
    trades = []
    for m in movements:
      instrument = fetched.instruments.get(m.orderbook_id)
      if m.category not in ("Buy", "Sell") or m.canceled or instrument is None or not m.quantity or m.price <= 0:
        continue
      security = await securities.get_or_create_by_name(name=instrument.name, ticker=instrument.ticker, currency=m.price_currency or m.currency)
      trades.append(
        {
          "user_id": user_id,
          "security_id": security.id,
          "bank_account_id": account.bank_account_id,
          "trade_type": TradeType.buy if m.category == "Buy" else TradeType.sell,
          "trade_date": m.day,
          "quantity": abs(_micro(m.quantity)),
          "price_per_unit": _minor(m.price),
          "currency": m.price_currency or m.currency,
          "notes": None,
          "external_id": f"montrose:{m.external_id}",
        }
      )
    await ImportedTradeRepository.from_session(session).insert_ignoring_duplicates(trades)

    snapshot = []
    for holdings in fetched.holdings:
      if holdings.account_id != account.external_id:
        continue
      for p in holdings.positions:
        if p.value is None or p.quantity == 0:
          continue
        security = await securities.get_or_create_by_name(name=p.name, ticker=p.ticker, currency=p.currency)
        snapshot.append(
          {
            "user_id": user_id,
            "bank_account_id": account.bank_account_id,
            "security_id": security.id,
            "snapshot_date": today,
            "quantity": _micro(p.quantity),
            "value": _minor(p.value),
            "acquired_value": _minor(p.acquired_value if p.acquired_value is not None else p.value),
            "currency": holdings.currency,
          }
        )
    await HoldingSnapshotRepository.from_session(session).replace_day(account.bank_account_id, today, snapshot)
    return created

  async def sync(self, session_maker: SessionMaker, connection_id: UUID) -> None:
    """Refreshes the consent and imports every linked account: its cash movements, trades and today's holdings."""
    started = utc_now()
    today = started.date()
    async with session_maker() as session:
      connection = await MontroseConnectionRepository.from_session(session).get_with_accounts(connection_id)
      if connection is None or connection.rejected_at is not None:
        return
      user_id, linked = connection.user_id, self.linked(connection)
    try:
      token = await self.access_token(session_maker, connection_id, now=started)
      async with montrose.http_client() as http:
        session = McpSession(http, token)
        await session.initialize()
        fetched = await fetch(session, account_ids=[a.external_id for a in linked], date_from=min((a.date_from for a in linked), default=today))
    except MontroseAuthError:
      await self._record(session_maker, connection_id, error=REJECTED, rejected_at=started)
      return
    except (MontroseError, httpx.HTTPError, KeyError, TypeError, ValueError) as e:
      # Only the error's class: replies can carry account details.
      log.warning("montrose_sync_failed", connection_id=str(connection_id), error=type(e).__name__)
      await self._record(session_maker, connection_id, error=UNREACHABLE)
      return

    async with session_maker() as session:
      connection = await MontroseConnectionRepository.from_session(session).get_with_accounts(connection_id)
      if connection is None:
        return
      self._merge_accounts(connection, fetched.accounts)
      by_external_id = {account.external_id: account for account in connection.accounts}
      cash = {h.account_id: h.cash for h in fetched.holdings}
      created = 0
      for account in linked:
        created += await self.import_account(session, user_id, account, fetched, today=today)
        stored = by_external_id.get(account.external_id)
        if stored is not None:
          stored.last_synced_at = started
          stored.cash_balance = _minor(cash[account.external_id]) if account.external_id in cash else stored.cash_balance
      connection.last_synced_at, connection.sync_error = started, None
    log.info("montrose_synced", connection_id=str(connection_id), created=created)

  async def _record(self, session_maker: SessionMaker, connection_id: UUID, *, error: str, rejected_at: datetime | None = None) -> None:
    async with session_maker() as session:
      connection = await MontroseConnectionRepository.from_session(session).get_by_id(connection_id)
      if connection is not None:
        connection.sync_error = error
        if rejected_at is not None and connection.rejected_at is None:
          connection.rejected_at = rejected_at


montrose_service = MontroseService()
