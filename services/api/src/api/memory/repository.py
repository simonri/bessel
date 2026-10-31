from collections.abc import Sequence
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import ColumnElement, Select, and_, case, func, literal_column, or_

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.models.memory_fact import MemoryFact, MemoryStatus


def _escape_like(text: str) -> str:
  return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


SWEDISH: ColumnElement[Any] = literal_column("'swedish'::regconfig")
# pg_trgm word similarity at which a word counts as found: 'hyra' in 'månadshyra' is 0.6, 'mat' in 'mamma' 0.5.
WORD_SIMILARITY = 0.6


def _current() -> ColumnElement[bool]:
  return MemoryFact.valid_to.is_(None)


def _hits(words: Sequence[str]) -> ColumnElement[int]:
  """How many of `words` a fact mentions: as a Swedish stem or the start of a compound ('hyra' finds 'hyror' and
  'hyresfritt'), or spelled closely enough ('månadshyra', 'gymet')."""
  haystack = func.concat_ws(" ", MemoryFact.area, MemoryFact.attribute, MemoryFact.statement)
  document = func.to_tsvector(SWEDISH, haystack)
  hits = []
  for word in words:
    query = func.to_tsquery(SWEDISH, f"{word}:*")
    # Stop words drop out of the query, and are too common to count by spelling either.
    spelled = and_(func.numnode(query) > 0, func.word_similarity(word, haystack) >= WORD_SIMILARITY)
    hits.append(case((or_(document.op("@@")(query), spelled), 1), else_=0))
  return sum(hits[1:], hits[0])


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

  async def list_current_related(self, user_id: UUID, words: Sequence[str], *, min_hits: int, limit: int) -> Sequence[MemoryFact]:
    """Current facts mentioning at least `min_hits` of `words`, those mentioning most first."""
    if not words:
      return []
    hits = _hits(words)
    statement = (
      self._owned(user_id)
      .where(_current(), MemoryFact.status != MemoryStatus.rejected, hits >= min_hits)
      .order_by(hits.desc(), MemoryFact.importance.desc())
      .limit(limit)
    )
    return await self.get_all(statement)

  async def search(
    self,
    user_id: UUID,
    *,
    words: Sequence[str] | None,
    area: str | None,
    status: MemoryStatus | None,
    as_of: date | None,
    include_past: bool,
    limit: int,
  ) -> Sequence[MemoryFact]:
    """Facts mentioning any of `words` (None: all), those mentioning most first, then the most important."""
    if words is not None and not words:
      return []
    filters: list[ColumnElement[bool]] = []
    order_by: list[ColumnElement[Any]] = []
    if words:
      hits = _hits(words)
      filters.append(hits > 0)
      order_by.append(hits.desc())
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
    statement = (
      self._owned(user_id)
      .where(*filters)
      .order_by(*order_by, MemoryFact.importance.desc(), func.coalesce(MemoryFact.modified_at, MemoryFact.created_at).desc())
      .limit(limit)
    )
    return await self.get_all(statement)
