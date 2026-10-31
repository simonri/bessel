from collections.abc import Sequence
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import ColumnElement, Select, and_, func, literal_column, or_, select, update
from sqlalchemy.orm.attributes import set_committed_value

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.models.memory_fact import MemoryFact, MemoryStatus


def _escape_like(text: str) -> str:
  return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


SWEDISH: ColumnElement[Any] = literal_column("'swedish'::regconfig")
# pg_trgm word similarity at which a word counts as found: 'hyra' in 'månadshyra' is 0.6, 'mat' in 'mamma' 0.5.
WORD_SIMILARITY = 0.6


def _current() -> ColumnElement[bool]:
  return MemoryFact.valid_to.is_(None)


def _mentions(word: str) -> ColumnElement[bool]:
  """Whether a fact mentions `word`: as a Swedish stem or the start of a compound ('hyra' finds 'hyror' and
  'hyresfritt'), or spelled closely enough ('månadshyra', 'gymet')."""
  haystack = func.concat_ws(" ", MemoryFact.area, MemoryFact.attribute, MemoryFact.statement)
  query = func.to_tsquery(SWEDISH, f"{word}:*")
  # Stop words drop out of the query, and are too common to count by spelling either.
  spelled = and_(func.numnode(query) > 0, func.word_similarity(word, haystack) >= WORD_SIMILARITY)
  return or_(func.to_tsvector(SWEDISH, haystack).op("@@")(query), spelled)


class MemoryFactRepository(
  RepositoryBase[MemoryFact],
  RepositoryIDMixin[MemoryFact, UUID],
  RepositoryUserMixin[MemoryFact],
):
  model = MemoryFact

  def _owned(self, user_id: UUID) -> Select[MemoryFact]:
    return self.get_base_statement().where(MemoryFact.user_id == user_id, MemoryFact.deleted_at.is_(None))

  async def list_current(self, user_id: UUID) -> Sequence[MemoryFact]:
    """Everything known now, most important first; rejected and closed facts are history."""
    statement = (
      self._owned(user_id)
      .where(_current(), MemoryFact.status != MemoryStatus.rejected)
      .order_by(MemoryFact.importance.desc(), MemoryFact.area, MemoryFact.attribute)
    )
    return await self.get_all(statement)

  async def list_current_for_everyone(self) -> Sequence[MemoryFact]:
    statement = self.get_base_statement().where(MemoryFact.deleted_at.is_(None), _current(), MemoryFact.status != MemoryStatus.rejected)
    return await self.get_all(statement)

  async def list_current_by_ids(self, user_id: UUID, ids: Sequence[UUID]) -> Sequence[MemoryFact]:
    if not ids:
      return []
    return await self.list_for_user(user_id, order_by=MemoryFact.created_at, extra_filters=(_current(), MemoryFact.id.in_(ids)))

  async def get_current_for_attribute(self, user_id: UUID, attribute: str, *, area: str | None = None) -> Sequence[MemoryFact]:
    """Current facts about `attribute`, in `area` or in any area, compared without case."""
    filters = [_current(), func.lower(MemoryFact.attribute) == attribute.strip().lower()]
    if area is not None:
      filters.append(func.lower(MemoryFact.area) == area.strip().lower())
    return await self.list_for_user(user_id, order_by=MemoryFact.created_at, extra_filters=filters)

  async def list_current_matching_words(self, user_id: UUID, words: Sequence[str], *, limit: int) -> Sequence[MemoryFact]:
    """Current facts with any of `words` as a whole word in their attribute: candidates to merge with instead of adding
    beside."""
    if not words:
      return []
    # `words` are plain \w+ runs, so they need no escaping inside the pattern.
    matches = [MemoryFact.attribute.op("~*")(rf"\m{word}\M") for word in words]
    return await self.list_for_user(
      user_id,
      order_by=MemoryFact.importance.desc(),
      extra_filters=(_current(), MemoryFact.status != MemoryStatus.rejected, or_(*matches)),
      limit=limit,
    )

  def _filters(self, *, area: str | None, status: MemoryStatus | None, as_of: date | None, include_past: bool) -> list[ColumnElement[bool]]:
    filters: list[ColumnElement[bool]] = []
    if area:
      prefix = _escape_like(area.rstrip("/"))
      filters.append(or_(MemoryFact.area.ilike(prefix, escape="\\"), MemoryFact.area.ilike(f"{prefix}/%", escape="\\")))
    if status is not None:
      filters.append(MemoryFact.status == status)
    if as_of is not None:
      filters.append(or_(MemoryFact.valid_from.is_(None), MemoryFact.valid_from <= as_of))
      filters.append(or_(MemoryFact.valid_to.is_(None), MemoryFact.valid_to > as_of))
    elif not include_past:
      filters.append(and_(_current(), MemoryFact.status != MemoryStatus.rejected))
    return filters

  async def search(
    self, user_id: UUID, *, area: str | None, status: MemoryStatus | None, as_of: date | None, include_past: bool, limit: int
  ) -> Sequence[MemoryFact]:
    """Facts matching the filters, the most important and most recently changed first."""
    statement = (
      self._owned(user_id)
      .where(*self._filters(area=area, status=status, as_of=as_of, include_past=include_past))
      .order_by(MemoryFact.importance.desc(), func.coalesce(MemoryFact.modified_at, MemoryFact.created_at).desc())
      .limit(limit)
    )
    return await self.get_all(statement)

  async def store_embedding(self, fact: MemoryFact, embedding: Sequence[float], key: str) -> None:
    """Saves a derived vector without counting as a change to the fact."""
    await self.session.execute(
      update(MemoryFact).where(MemoryFact.id == fact.id).values(embedding=list(embedding), embedding_key=key, modified_at=MemoryFact.modified_at)
    )
    set_committed_value(fact, "embedding", list(embedding))
    set_committed_value(fact, "embedding_key", key)

  async def list_with_mentions(
    self, user_id: UUID, words: Sequence[str], *, area: str | None, status: MemoryStatus | None, as_of: date | None, include_past: bool
  ) -> list[tuple[MemoryFact, tuple[bool, ...]]]:
    """Every fact matching the filters, each with which of `words` it mentions, for the caller to rank. Memory is
    small enough to rank in full."""
    statement = (
      select(MemoryFact, *(_mentions(word) for word in words))
      .where(MemoryFact.user_id == user_id, MemoryFact.deleted_at.is_(None))
      .where(*self._filters(area=area, status=status, as_of=as_of, include_past=include_past))
    )
    rows = (await self.session.execute(statement)).all()
    return [(row[0], tuple(bool(mentioned) for mentioned in row[1:])) for row in rows]
