import json
import secrets
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

import httpx
import structlog

from api.common.encryption import InvalidToken, decrypt, encrypt
from api.common.utils import utc_now
from api.logging import Logger
from api.models.bank_account import BankAccount
from api.models.montrose import MontroseAccount, MontroseConnection
from api.montrose import client as montrose
from api.montrose.client import McpSession, MontroseAuthError, MontroseError, RegisteredClient, Tokens
from api.montrose.repository import MontroseAccountRepository, MontroseConnectionRepository
from api.postgres import AsyncSession
from api.settings import settings
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


class MontroseStateError(Exception):
  """The callback doesn't belong to a login this user started, or it came too late."""


class MontroseConflictError(Exception):
  """The Bessel account already takes another Montrose account's transactions."""


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

  async def sync(self, session_maker: SessionMaker, connection_id: UUID) -> None:
    """Keeps the consent alive and the account list current. Transactions and holdings follow once their format is mapped."""
    started = utc_now()
    try:
      token = await self.access_token(session_maker, connection_id, now=started)
      async with montrose.http_client() as http:
        session = McpSession(http, token)
        await session.initialize()
        found = parse_accounts(await session.call_tool("get_user_accounts"))
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
      self._merge_accounts(connection, found)
      connection.last_synced_at, connection.sync_error = started, None
    log.info("montrose_synced", connection_id=str(connection_id), accounts=len(found))

  async def _record(self, session_maker: SessionMaker, connection_id: UUID, *, error: str, rejected_at: datetime | None = None) -> None:
    async with session_maker() as session:
      connection = await MontroseConnectionRepository.from_session(session).get_by_id(connection_id)
      if connection is not None:
        connection.sync_error = error
        if rejected_at is not None and connection.rejected_at is None:
          connection.rejected_at = rejected_at


montrose_service = MontroseService()
