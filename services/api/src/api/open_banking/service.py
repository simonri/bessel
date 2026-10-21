import hashlib
import json
from collections import Counter
from collections.abc import Callable
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from uuid import UUID

import httpx
import structlog

from api.common.encryption import InvalidToken, decrypt, encrypt
from api.common.utils import utc_now
from api.logging import Logger
from api.models.bank_account import BankAccount
from api.models.bank_connection import BankConnection, BankConnectionAccount
from api.models.notification import Notification
from api.models.transaction import TransactionDirection
from api.open_banking import http
from api.open_banking.enable_banking import BookedTransaction, EnableBankingClient, EnableBankingError, SessionGoneError
from api.open_banking.repository import BankConnectionRepository
from api.postgres import AsyncSession
from api.settings import settings
from api.transactions.parsers.base import ParsedTransaction
from api.transactions.repository import TransactionRepository
from api.transactions.service import transaction_service
from api.worker import enqueue_job

log: Logger = structlog.get_logger()

type SessionMaker = Callable[[], AbstractAsyncContextManager[AsyncSession]]

SYNC_ACTOR = "sync_bank_connection"
STATE_TTL_SECONDS = 15 * 60
# Ask for a little less than the bank allows, so clock drift can't push the request over its limit.
CONSENT_MARGIN = timedelta(hours=1)
EXPIRY_WARNING = timedelta(days=14)
# Every sync reads this far back again, so transactions the bank books late still arrive.
OVERLAP = timedelta(days=7)
# How far back the first import reaches into an empty Bessel account.
FIRST_IMPORT = timedelta(days=365)
# Prefix of dedup hashes for imported bank transactions; hand-imported ones never have it.
HASH_PREFIX = "eb:"


class BankConnectError(Exception):
  """A connection the user started can't be completed; the message says what to do."""


class BankUnavailableError(Exception):
  """Enable Banking isn't configured, or doesn't list the bank."""


def bank_name() -> str:
  return settings.ENABLE_BANKING_BANK_NAME


def available_to(user_id: UUID) -> bool:
  return settings.enable_banking_configured() and user_id in settings.ENABLE_BANKING_USER_IDS


def _client(http_client: httpx.AsyncClient) -> EnableBankingClient:
  return EnableBankingClient(http_client, app_id=settings.ENABLE_BANKING_APP_ID, private_key=settings.enable_banking_private_key())


def dedup_hash(identification_hash: str, transaction: BookedTransaction, occurrence: int) -> str:
  """Stable across sessions, so approving again never imports history twice."""
  if transaction.reference:
    key = f"{identification_hash}:ref:{transaction.reference}"
  else:
    key = f"{identification_hash}:{transaction.booking_date}:{transaction.amount}:{transaction.credit}:{transaction.description}:{occurrence}"
  return HASH_PREFIX + hashlib.sha256(key.encode()).hexdigest()


def _minor_units(amount: Decimal) -> int:
  return int((amount * 100).to_integral_value())


def _direction(transaction: BookedTransaction) -> TransactionDirection:
  return TransactionDirection.credit if transaction.credit else TransactionDirection.debit


@dataclass(frozen=True, slots=True)
class AccountToSync:
  id: UUID
  bank_account_id: UUID
  uid: str
  identification_hash: str
  date_from: date
  import_from: date


class OpenBankingService:
  async def start_connection(self, user_id: UUID) -> str:
    """The URL where the user approves access with BankID; it returns to the web app's callback page."""
    state = encrypt(json.dumps({"user_id": str(user_id)}))
    async with http.client() as http_client:
      client = _client(http_client)
      bank = await client.get_bank(bank_name(), settings.ENABLE_BANKING_BANK_COUNTRY)
      if bank is None:
        raise BankUnavailableError(f"Enable Banking doesn't list {bank_name()} right now.")
      valid_until = utc_now() + timedelta(seconds=bank.maximum_consent_seconds) - CONSENT_MARGIN
      return await client.start_authorization(bank, valid_until=valid_until, redirect_url=settings.enable_banking_redirect_url(), state=state)

  async def complete_connection(self, connections: BankConnectionRepository, user_id: UUID, *, code: str, state: str) -> BankConnection:
    try:
      state_user_id = UUID(json.loads(decrypt(state, ttl=STATE_TTL_SECONDS))["user_id"])
    except (InvalidToken, ValueError, KeyError) as e:
      raise BankConnectError(f"This link has expired. Connect {bank_name()} again from Bessel.") from e
    # Otherwise someone could send their own approval link to another user and
    # have that person's bank account land in their Bessel.
    if state_user_id != user_id:
      raise BankConnectError("This was started from a different Bessel account. Start again from Bessel.")

    async with http.client() as http_client:
      client = _client(http_client)
      session = await client.create_session(code)
      connection = await connections.get_for_bank(user_id, bank_name(), settings.ENABLE_BANKING_BANK_COUNTRY)
      if connection is not None:
        previous_session_id = decrypt(connection.encrypted_session_id)
        try:
          await client.delete_session(previous_session_id)
        except (EnableBankingError, httpx.HTTPError):
          log.info("enable_banking_old_session_not_closed", connection_id=str(connection.id))

    if connection is None:
      connection = BankConnection(
        user_id=user_id,
        bank_name=bank_name(),
        bank_country=settings.ENABLE_BANKING_BANK_COUNTRY,
        encrypted_session_id="",
        valid_until=session.valid_until,
        accounts=[],
      )
      await connections.create(connection)
    connection.encrypted_session_id = encrypt(session.session_id)
    connection.valid_until = session.valid_until
    connection.expiry_notified_at = None
    connection.sync_error = None

    known = {account.identification_hash: account for account in connection.accounts}
    approved = {account.identification_hash for account in session.accounts}
    for existing in known.values():
      existing.shared = existing.identification_hash in approved
    for account in session.accounts:
      existing = known.get(account.identification_hash)
      if existing is None:
        connection.accounts.append(
          BankConnectionAccount(
            identification_hash=account.identification_hash, uid=account.uid, name=account.name, iban=account.iban, currency=account.currency
          )
        )
      else:
        existing.uid, existing.name, existing.iban, existing.currency = account.uid, account.name, account.iban, account.currency
    await connections.session.flush()
    return connection

  def request_sync(self, connection_id: UUID) -> None:
    enqueue_job(SYNC_ACTOR, str(connection_id))

  async def disconnect(self, connections: BankConnectionRepository, connection: BankConnection) -> None:
    """Forgets the connection; the bank side is closed too when Enable Banking answers."""
    try:
      async with http.client() as http_client:
        await _client(http_client).delete_session(decrypt(connection.encrypted_session_id))
    except (EnableBankingError, httpx.HTTPError, InvalidToken):
      log.info("enable_banking_session_not_closed", connection_id=str(connection.id))
    await connections.delete(connection)

  async def link_account(self, session: AsyncSession, account: BankConnectionAccount, bank_account: BankAccount | None) -> None:
    """Points the bank account at a Bessel account; importing starts from that account's newest transaction."""
    if bank_account is None:
      account.bank_account_id, account.import_from, account.last_synced_at = None, None, None
      return
    if account.bank_account_id == bank_account.id:
      return
    newest = await TransactionRepository.from_session(session).newest_date_for_bank_account(bank_account.id)
    account.bank_account_id = bank_account.id
    account.import_from = newest or (utc_now() - FIRST_IMPORT).date()
    # A new link reaches back to `import_from` again, not just a week.
    account.last_synced_at = None

  def accounts_to_sync(self, connection: BankConnection) -> list[AccountToSync]:
    return [
      AccountToSync(
        id=account.id,
        bank_account_id=account.bank_account_id,
        uid=account.uid,
        identification_hash=account.identification_hash,
        date_from=max(account.import_from, (account.last_synced_at - OVERLAP).date()) if account.last_synced_at else account.import_from,
        import_from=account.import_from,
      )
      for account in connection.accounts
      if account.shared and account.bank_account_id is not None and account.import_from is not None
    ]

  async def fetch(self, accounts: list[AccountToSync]) -> dict[UUID, list[BookedTransaction] | None]:
    """Each account's booked transactions, or None where reading it failed; an ended approval fails them all."""
    booked: dict[UUID, list[BookedTransaction] | None] = {}
    async with http.client() as http_client:
      client = _client(http_client)
      for account in accounts:
        try:
          booked[account.id] = await client.booked_transactions(account.uid, date_from=account.date_from)
        except SessionGoneError:
          raise
        except (EnableBankingError, httpx.HTTPError):
          log.warning("enable_banking_account_read_failed", account_id=str(account.id), exc_info=True)
          booked[account.id] = None
    return booked

  async def import_booked(self, session: AsyncSession, user_id: UUID, account: AccountToSync, booked: list[BookedTransaction]) -> tuple[int, int]:
    """Imports what the bank booked, skipping transactions already imported by hand on the switchover day."""
    transactions = TransactionRepository.from_session(session)
    # Hand-imported descriptions don't match the bank's, so the switchover day
    # is matched on amount and direction only, counting repeats.
    hand_imported = Counter(await transactions.amounts_on_date(account.bank_account_id, account.import_from, excluding_hash_prefix=HASH_PREFIX))
    occurrences: Counter[tuple[date, Decimal, bool, str]] = Counter()
    parsed: list[ParsedTransaction] = []
    for transaction in booked:
      if transaction.booking_date < account.import_from:
        continue
      amount, direction = _minor_units(transaction.amount), _direction(transaction)
      if transaction.booking_date == account.import_from and hand_imported[(amount, direction)] > 0:
        hand_imported[(amount, direction)] -= 1
        continue
      key = (transaction.booking_date, transaction.amount, transaction.credit, transaction.description)
      parsed.append(
        ParsedTransaction(
          transaction_date=transaction.booking_date,
          amount_minor=amount,
          currency=transaction.currency,
          direction=direction,
          dedup_hash=dedup_hash(account.identification_hash, transaction, occurrences[key]),
          description=transaction.description,
          raw_data=transaction.raw,
        )
      )
      occurrences[key] += 1
    return await transaction_service.import_transactions(
      session,
      bank_account_id=account.bank_account_id,
      bank_name=f"enablebanking:{bank_name().lower()}",
      file_format="api",
      raw_content=json.dumps([t.raw_data for t in parsed]),
      parsed=parsed,
      user_id=user_id,
    )

  async def sync(self, session_maker: SessionMaker, connection_id: UUID) -> None:
    """Imports new transactions for every linked account; failures are recorded on the connection."""
    async with session_maker() as session:
      connection = await BankConnectionRepository.from_session(session).get_with_accounts(connection_id)
      if connection is None:
        return
      if connection.valid_until <= utc_now():
        connection.sync_error = f"{bank_name()}'s approval has ended. Renew it with BankID."
        return
      user_id, accounts = connection.user_id, self.accounts_to_sync(connection)

    started = utc_now()
    try:
      booked = await self.fetch(accounts)
    except SessionGoneError:
      await self._record_error(session_maker, connection_id, f"{bank_name()}'s approval has ended. Renew it with BankID.")
      return

    async with session_maker() as session:
      connection = await BankConnectionRepository.from_session(session).get_with_accounts(connection_id)
      if connection is None:
        return
      stored = {account.id: account for account in connection.accounts}
      created = 0
      for account in accounts:
        transactions = booked[account.id]
        if transactions is None or account.id not in stored:
          continue
        created += (await self.import_booked(session, user_id, account, transactions))[0]
        stored[account.id].last_synced_at = started
      failed = sum(1 for transactions in booked.values() if transactions is None)
      connection.sync_error = f"Couldn't reach {bank_name()}. Bessel tries again at the next sync." if failed else None
      if failed < len(booked) or not booked:
        connection.last_synced_at = started
    log.info("enable_banking_synced", connection_id=str(connection_id), created=created, failed=failed)

  async def _record_error(self, session_maker: SessionMaker, connection_id: UUID, message: str) -> None:
    async with session_maker() as session:
      connection = await BankConnectionRepository.from_session(session).get_by_id(connection_id)
      if connection is not None:
        connection.sync_error = message

  async def warn_before_expiry(self, session: AsyncSession, connection: BankConnection, *, now: datetime) -> bool:
    """Leaves one notification when the approval is about to end; True if it did."""
    if connection.expiry_notified_at is not None or connection.valid_until - now > EXPIRY_WARNING:
      return False
    ends = connection.valid_until.astimezone(UTC).date()
    session.add(
      Notification(
        user_id=connection.user_id,
        title=f"Renew {bank_name()} access",
        body=f"Bessel can read {bank_name()} until {ends:%-d %B}. Approve again with BankID to keep transactions importing.",
        link="/accounts",
        kind="warning",
      )
    )
    connection.expiry_notified_at = now
    return True


open_banking_service = OpenBankingService()
