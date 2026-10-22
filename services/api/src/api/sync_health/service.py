"""Tells the user when a bank or Avanza stops syncing, so a quiet gap in their transactions can't go unnoticed."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from api.avanza.repository import AvanzaConnectionRepository
from api.models.notification import Notification
from api.open_banking.repository import BankConnectionRepository
from api.postgres import AsyncSession

# Syncs run twice a day, so a day and a half without one means at least two in a row failed or never ran.
STALE_AFTER = timedelta(hours=36)


@dataclass(frozen=True, slots=True)
class Source:
  user_id: UUID
  name: str
  synced_at: datetime


def _stale(source: Source, now: datetime) -> bool:
  return now - source.synced_at > STALE_AFTER


def _warning(source: Source) -> Notification:
  return Notification(
    user_id=source.user_id,
    title=f"{source.name} has stopped syncing",
    body=f"Bessel last read {source.name} on {source.synced_at:%-d %B}. Transactions since then are missing until it syncs again; Accounts shows why.",
    link="/accounts",
    kind="warning",
  )


async def warn_stale(session: AsyncSession, *, now: datetime) -> int:
  """Leaves one notification per linked connection that hasn't synced lately; returns how many."""
  warned = 0
  for connection in await BankConnectionRepository.from_session(session).list_with_accounts():
    if connection.stale_notified_at is not None or not any(a.bank_account_id and a.shared for a in connection.accounts):
      continue
    source = Source(connection.user_id, connection.bank_name, connection.last_synced_at or connection.created_at)
    if _stale(source, now):
      session.add(_warning(source))
      connection.stale_notified_at = now
      warned += 1
  for avanza in await AvanzaConnectionRepository.from_session(session).list_with_accounts():
    if avanza.stale_notified_at is not None or not any(a.bank_account_id for a in avanza.accounts):
      continue
    source = Source(avanza.user_id, "Avanza", avanza.last_synced_at or avanza.created_at)
    if _stale(source, now):
      session.add(_warning(source))
      avanza.stale_notified_at = now
      warned += 1
  return warned
