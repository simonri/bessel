"""Pairs money moving between a user's own accounts, so it counts as neither income nor spending."""

from collections import defaultdict
from datetime import date, timedelta
from uuid import UUID, uuid4

from api.common.db.postgres import AsyncSession
from api.models.transaction import TransactionDirection
from api.transactions.repository import TransactionRepository, TransferCandidate

# A transfer between banks can book a day or two apart on each side.
WINDOW = timedelta(days=2)


def pair(candidates: list[TransferCandidate]) -> list[tuple[UUID, UUID]]:
  """(debit, credit) pairs: same amount and currency, other accounts, within the window, and each the other's only match."""
  credits_by_amount: dict[tuple[int, str], list[TransferCandidate]] = defaultdict(list)
  for candidate in candidates:
    if candidate.direction == TransactionDirection.credit:
      credits_by_amount[(candidate.amount, candidate.currency)].append(candidate)

  def matches(debit: TransferCandidate, credit: TransferCandidate) -> bool:
    return debit.bank_account_id != credit.bank_account_id and abs(debit.transaction_date - credit.transaction_date) <= WINDOW

  debits = sorted((c for c in candidates if c.direction == TransactionDirection.debit), key=lambda c: (c.transaction_date, str(c.id)))
  matches_of: dict[UUID, list[UUID]] = defaultdict(list)
  for debit in debits:
    for credit in credits_by_amount[(debit.amount, debit.currency)]:
      if matches(debit, credit):
        matches_of[debit.id].append(credit.id)
        matches_of[credit.id].append(debit.id)
  # Two same-sized transfers close together can't be told apart, so neither is paired.
  pairs: list[tuple[UUID, UUID]] = []
  for debit in debits:
    found = matches_of.get(debit.id, [])
    if len(found) == 1 and len(matches_of[found[0]]) == 1:
      pairs.append((debit.id, found[0]))
  return pairs


async def match_transfers(session: AsyncSession, user_id: UUID, *, since: date | None = None) -> int:
  """Marks newly paired transfers from `since` on (or all history); returns how many pairs it found."""
  repository = TransactionRepository.from_session(session)
  candidates = await repository.transfer_candidates(user_id, since=since - WINDOW if since else None)
  pairs = pair(list(candidates))
  for debit_id, credit_id in pairs:
    await repository.set_transfer(user_id, [debit_id, credit_id], uuid4())
  return len(pairs)
