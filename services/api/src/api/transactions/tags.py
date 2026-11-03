"""The user's own tags on transactions, such as a trip, a project or "ask the accountant"."""

from collections.abc import Sequence
from datetime import date
from uuid import UUID

from api.exceptions import ValidationError
from api.models.transaction import Transaction, TransactionDirection
from api.postgres import AsyncSession
from api.transactions.repository import TransactionRepository
from api.transactions.schemas import MAX_TAGS, TagSummary, TagTotal, distinct_tags


async def _spelled_as_before(repository: TransactionRepository, user_id: UUID, tags: Sequence[str]) -> list[str]:
  """The tags as the user already spells them elsewhere, so "lisbon" joins "Lisbon" rather than starting a second tag."""
  known = {tag.casefold(): tag for tag in reversed(await repository.tag_usage(user_id))}
  return distinct_tags([known.get(tag.casefold(), tag) for tag in tags])


def _check_count(tags: Sequence[str]) -> None:
  if len(tags) > MAX_TAGS:
    raise ValidationError(f"A transaction can have at most {MAX_TAGS} tags.", status_code=422)


async def set_tags(session: AsyncSession, transaction: Transaction, tags: Sequence[str]) -> None:
  repository = TransactionRepository.from_session(session)
  await repository.update(transaction, update_dict={"tags": await _spelled_as_before(repository, transaction.user_id, tags)}, flush=True)


async def tag_many(session: AsyncSession, user_id: UUID, ids: Sequence[UUID], *, add: Sequence[str], remove: Sequence[str]) -> int:
  """Adds and takes off tags on the user's transactions among `ids`; returns how many changed."""
  repository = TransactionRepository.from_session(session)
  add = await _spelled_as_before(repository, user_id, add)
  removed = {tag.casefold() for tag in remove}
  changed = 0
  for transaction in await repository.owned_by_ids(user_id, ids):
    tags = distinct_tags([tag for tag in transaction.tags if tag.casefold() not in removed] + add)
    if tags != transaction.tags:
      _check_count(tags)
      transaction.tags = tags
      changed += 1
  await session.flush()
  return changed


async def tag_summaries(session: AsyncSession, user_id: UUID, *, date_from: date | None, date_to: date | None, is_business: bool | None) -> list[TagSummary]:
  """Each tag used in the period, with what went out and came in under it per currency."""
  rows = await TransactionRepository.from_session(session).tag_totals(user_id, date_from=date_from, date_to=date_to, is_business=is_business)
  counts: dict[str, int] = {}
  totals: dict[str, dict[str, TagTotal]] = {}
  for tag, currency, direction, amount, count in rows:
    counts[tag] = counts.get(tag, 0) + count
    total = totals.setdefault(tag, {}).setdefault(currency, TagTotal(currency=currency, spent=0, received=0))
    if direction == TransactionDirection.debit:
      total.spent += amount
    else:
      total.received += amount
  return [
    TagSummary(tag=tag, count=count, totals=sorted(totals[tag].values(), key=lambda t: (-t.spent, t.currency)))
    for tag, count in sorted(counts.items(), key=lambda item: (-item[1], item[0].casefold()))
  ]
