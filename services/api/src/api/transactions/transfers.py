"""Pairs money moving between a user's own accounts, so it counts as neither income nor spending."""

from collections import defaultdict
from collections.abc import Iterator
from datetime import date, timedelta
from uuid import UUID, uuid4

from api.common.db.postgres import AsyncSession
from api.models.transaction import TransactionDirection
from api.transactions.repository import TransactionRepository, TransferCandidate

# A transfer between banks can book a day or two apart on each side.
WINDOW = timedelta(days=2)
# Larger knots of equal amounts are left alone rather than guessed at.
MAX_GROUP = 6


def _matches(debit: TransferCandidate, credit: TransferCandidate) -> bool:
  """For a debit and credit of the same amount and currency."""
  return (
    debit.bank_account_id != credit.bank_account_id and debit.business == credit.business and abs(debit.transaction_date - credit.transaction_date) <= WINDOW
  )


def _by_date(candidates: list[TransferCandidate]) -> list[TransferCandidate]:
  return sorted(candidates, key=lambda c: (c.transaction_date, str(c.id)))


def _groups(candidates: list[TransferCandidate]) -> Iterator[tuple[list[TransferCandidate], list[TransferCandidate]]]:
  """Debits and credits that could be each other's other side, as connected groups."""
  credits_by_amount: dict[tuple[int, str], list[TransferCandidate]] = defaultdict(list)
  for candidate in candidates:
    if candidate.direction == TransactionDirection.credit:
      credits_by_amount[(candidate.amount, candidate.currency)].append(candidate)
  parent = {c.id: c.id for c in candidates}

  def root(node: UUID) -> UUID:
    while parent[node] != node:
      parent[node] = parent[parent[node]]
      node = parent[node]
    return node

  linked: set[UUID] = set()
  for debit in candidates:
    if debit.direction != TransactionDirection.debit:
      continue
    for credit in credits_by_amount[(debit.amount, debit.currency)]:
      if _matches(debit, credit):
        parent[root(debit.id)] = root(credit.id)
        linked.update((debit.id, credit.id))
  groups: dict[UUID, list[TransferCandidate]] = defaultdict(list)
  for candidate in candidates:
    if candidate.id in linked:
      groups[root(candidate.id)].append(candidate)
  for members in groups.values():
    yield (
      _by_date([m for m in members if m.direction == TransactionDirection.debit]),
      _by_date([m for m in members if m.direction == TransactionDirection.credit]),
    )


def _pairings(outs: list[TransferCandidate], ins: list[TransferCandidate], limit: int) -> list[list[tuple[UUID, UUID]]]:
  """Up to `limit` ways to give every debit its own matching credit."""
  found: list[list[tuple[UUID, UUID]]] = []

  def extend(index: int, used: frozenset[UUID], chosen: list[tuple[UUID, UUID]]) -> None:
    if len(found) >= limit:
      return
    if index == len(outs):
      found.append(chosen)
      return
    for credit in ins:
      if credit.id not in used and _matches(outs[index], credit):
        extend(index + 1, used | {credit.id}, [*chosen, (outs[index].id, credit.id)])

  extend(0, frozenset(), [])
  return found


def pair(candidates: list[TransferCandidate]) -> list[tuple[UUID, UUID]]:
  """(debit, credit) pairs where there's no doubt which transactions are the two sides of one move.

  A group pairs when its debits and credits can be matched up in exactly one way,
  such as Sparkonto to Allt i Ett to Klarna on one day. It also pairs when the ways
  only swap identical moves, like two 1,000 kr top-ups from one account to another,
  since any choice counts the same. Anything else is left unpaired.
  """
  pairs: list[tuple[UUID, UUID]] = []
  for outs, ins in _groups(candidates):
    if len(outs) != len(ins) or len(outs) > MAX_GROUP:
      continue
    interchangeable = len({d.bank_account_id for d in outs}) == 1 and len({c.bank_account_id for c in ins}) == 1
    if interchangeable and all(_matches(d, c) for d, c in zip(outs, ins, strict=True)):
      pairs.extend((d.id, c.id) for d, c in zip(outs, ins, strict=True))
      continue
    ways = _pairings(outs, ins, limit=2)
    if len(ways) == 1:
      pairs.extend(ways[0])
  return pairs


async def match_transfers(session: AsyncSession, user_id: UUID, *, since: date | None = None) -> int:
  """Marks newly paired transfers from `since` on (or all history); returns how many pairs it found."""
  repository = TransactionRepository.from_session(session)
  candidates = await repository.transfer_candidates(user_id, since=since - WINDOW if since else None)
  pairs = pair(list(candidates))
  for debit_id, credit_id in pairs:
    await repository.set_transfer(user_id, [debit_id, credit_id], uuid4())
  return len(pairs)
