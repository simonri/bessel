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

from api.bank_accounts.repository import BankAccountRepository
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


def banks() -> list[str]:
  return settings.ENABLE_BANKING_BANKS


def _approval_ended(bank_name: str) -> str:
  return f"{bank_name}'s approval has ended. Renew it to keep importing."


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


def _description(transaction: BookedTransaction) -> str:
  """The bank's text, or its transaction code ("Incoming transaction") when it sends none."""
  if transaction.description or not transaction.code:
    return transaction.description
  return transaction.code.replace("_", " ").capitalize()


def _money(minor: int, currency: str) -> str:
  return f"{minor / 100:,.2f} {currency}"


def _direction(transaction: BookedTransaction) -> TransactionDirection:
  return TransactionDirection.credit if transaction.credit else TransactionDirection.debit


@dataclass(frozen=True, slots=True)
class AccountRead:
  booked: list[BookedTransaction]
  balance: Decimal | None


@dataclass(frozen=True, slots=True)
class AccountToSync:
  id: UUID
  bank_account_id: UUID
  uid: str
  identification_hash: str
  date_from: date
  import_from: date


class OpenBankingService:
  async def start_connection(self, user_id: UUID, bank_name: str) -> str:
    """The URL where the user approves access at the bank; it returns to the web app's callback page."""
    state = encrypt(json.dumps({"user_id": str(user_id), "bank": bank_name}))
    async with http.client() as http_client:
      client = _client(http_client)
      bank = await client.get_bank(bank_name, settings.ENABLE_BANKING_BANK_COUNTRY)
      if bank is None:
        raise BankUnavailableError(f"Enable Banking doesn't list {bank_name} right now.")
      valid_until = utc_now() + timedelta(seconds=bank.maximum_consent_seconds) - CONSENT_MARGIN
      return await client.start_authorization(bank, valid_until=valid_until, redirect_url=settings.enable_banking_redirect_url(), state=state)

  async def complete_connection(self, connections: BankConnectionRepository, user_id: UUID, *, code: str, state: str) -> BankConnection:
    try:
      payload = json.loads(decrypt(state, ttl=STATE_TTL_SECONDS))
      state_user_id, bank_name = UUID(payload["user_id"]), str(payload["bank"])
    except (InvalidToken, ValueError, KeyError) as e:
      raise BankConnectError("This link has expired. Connect the bank again from Bessel.") from e
    # Otherwise someone could send their own approval link to another user and
    # have that person's bank account land in their Bessel.
    if state_user_id != user_id:
      raise BankConnectError("This was started from a different Bessel account. Start again from Bessel.")

    async with http.client() as http_client:
      client = _client(http_client)
      session = await client.create_session(code)
      connection = await connections.get_for_bank(user_id, bank_name, settings.ENABLE_BANKING_BANK_COUNTRY)
      if connection is not None:
        previous_session_id = decrypt(connection.encrypted_session_id)
        try:
          await client.delete_session(previous_session_id)
        except (EnableBankingError, httpx.HTTPError):
          log.info("enable_banking_old_session_not_closed", connection_id=str(connection.id))

    if connection is None:
      connection = BankConnection(
        user_id=user_id,
        bank_name=bank_name,
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
    account.bank_balance, account.balance_anchored_at, account.balance_drift, account.drift_notified_at = None, None, None, None

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

  async def fetch(self, accounts: list[AccountToSync]) -> dict[UUID, AccountRead | None]:
    """Each account's booked transactions and balance, or None where reading them failed; an ended approval fails them all."""
    reads: dict[UUID, AccountRead | None] = {}
    async with http.client() as http_client:
      client = _client(http_client)
      for account in accounts:
        try:
          booked = await client.booked_transactions(account.uid, date_from=account.date_from)
        except SessionGoneError:
          raise
        except (EnableBankingError, httpx.HTTPError):
          log.warning("enable_banking_account_read_failed", account_id=str(account.id), exc_info=True)
          reads[account.id] = None
          continue
        try:
          balance = await client.balance(account.uid)
        except SessionGoneError:
          raise
        except (EnableBankingError, httpx.HTTPError):
          log.warning("enable_banking_balance_read_failed", account_id=str(account.id), exc_info=True)
          balance = None
        reads[account.id] = AccountRead(booked=booked, balance=balance)
    return reads

  async def import_booked(
    self, session: AsyncSession, user_id: UUID, bank_name: str, account: AccountToSync, booked: list[BookedTransaction]
  ) -> tuple[int, int]:
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
          description=_description(transaction),
          raw_data=transaction.raw,
        )
      )
      occurrences[key] += 1
    return await transaction_service.import_transactions(
      session,
      bank_account_id=account.bank_account_id,
      bank_name=f"enablebanking:{bank_name.lower()}",
      file_format="api",
      raw_content=json.dumps([t.raw_data for t in parsed]),
      parsed=parsed,
      user_id=user_id,
    )

  async def reconcile(self, session: AsyncSession, bank_name: str, user_id: UUID, account: BankConnectionAccount, balance: Decimal, *, now: datetime) -> None:
    """Compares the bank's balance with Bessel's, warning once when they keep disagreeing.

    The first balance after linking sets the starting balance, so whatever history Bessel
    holds adds up to the bank's. It stays put afterwards: a gap must show, not be absorbed.
    """
    if account.bank_account_id is None:
      return
    bank_account = await BankAccountRepository.from_session(session).get_by_id(account.bank_account_id)
    if bank_account is None:
      return
    net = (await TransactionRepository.from_session(session).net_balances_by_account([bank_account.id])).get(bank_account.id, 0)
    bank_minor = _minor_units(balance)
    if account.balance_anchored_at is None:
      bank_account.base_balance = bank_minor - net
      account.balance_anchored_at = now
    previous, drift = account.balance_drift, bank_minor - (bank_account.base_balance + net)
    account.bank_balance, account.balance_drift = bank_minor, drift
    if drift == 0:
      account.drift_notified_at = None
    # A transaction booked between reading the transactions and the balance drifts
    # one sync; only drift that lasts is worth a warning.
    elif previous and account.drift_notified_at is None:
      bank_says, bessel_says = _money(bank_minor, bank_account.currency), _money(bank_minor - drift, bank_account.currency)
      session.add(
        Notification(
          user_id=user_id,
          title=f"{bank_account.name} doesn't match {bank_name}",
          body=f"{bank_name} says {bank_says}, Bessel {bessel_says}. A transaction may be missing or doubled, or a card payment still pending.",
          link="/accounts",
          kind="warning",
        )
      )
      account.drift_notified_at = now

  async def sync(self, session_maker: SessionMaker, connection_id: UUID) -> None:
    """Imports new transactions for every linked account; failures are recorded on the connection."""
    async with session_maker() as session:
      connection = await BankConnectionRepository.from_session(session).get_with_accounts(connection_id)
      if connection is None:
        return
      if connection.valid_until <= utc_now():
        connection.sync_error = _approval_ended(connection.bank_name)
        return
      user_id, bank_name, accounts = connection.user_id, connection.bank_name, self.accounts_to_sync(connection)

    started = utc_now()
    try:
      reads = await self.fetch(accounts)
    except SessionGoneError:
      await self._record_error(session_maker, connection_id, _approval_ended(bank_name))
      return

    async with session_maker() as session:
      connection = await BankConnectionRepository.from_session(session).get_with_accounts(connection_id)
      if connection is None:
        return
      stored = {account.id: account for account in connection.accounts}
      created = 0
      for account in accounts:
        read = reads[account.id]
        if read is None or account.id not in stored:
          continue
        created += (await self.import_booked(session, user_id, bank_name, account, read.booked))[0]
        if read.balance is not None:
          await self.reconcile(session, bank_name, user_id, stored[account.id], read.balance, now=started)
        stored[account.id].last_synced_at = started
      failed = sum(1 for read in reads.values() if read is None)
      connection.sync_error = f"Couldn't reach {bank_name}. Bessel tries again at the next sync." if failed else None
      if failed < len(reads) or not reads:
        connection.last_synced_at, connection.stale_notified_at = started, None
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
        title=f"Renew {connection.bank_name} access",
        body=f"Bessel can read {connection.bank_name} until {ends:%-d %B}. Renew the approval from Accounts to keep transactions importing.",
        link="/accounts",
        kind="warning",
      )
    )
    connection.expiry_notified_at = now
    return True


open_banking_service = OpenBankingService()
