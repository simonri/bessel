from collections.abc import Sequence
from datetime import date
from uuid import UUID

from sqlalchemy import ColumnElement, Select, and_, func, or_

from api.common.repository.base import RepositoryBase, RepositoryIDMixin, RepositoryUserMixin
from api.models.memory_fact import MemoryFact, MemoryStatus


def _escape_like(text: str) -> str:
  return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _current() -> ColumnElement[bool]:
  return MemoryFact.valid_to.is_(None)


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

  async def get_current_for_attribute(self, user_id: UUID, attribute: str) -> Sequence[MemoryFact]:
    """Current facts about `attribute` in any area, compared without case."""
    return await self.list_for_user(
      user_id,
      order_by=MemoryFact.created_at,
      extra_filters=(_current(), func.lower(MemoryFact.attribute) == attribute.lower()),
    )

  async def list_current_matching_words(self, user_id: UUID, words: Sequence[str], *, limit: int) -> Sequence[MemoryFact]:
    """Current facts whose attribute contains any of `words`: candidates to merge with instead of adding beside."""
    if not words:
      return []
    matches = [MemoryFact.attribute.ilike(f"%{_escape_like(word)}%", escape="\\") for word in words]
    return await self.list_for_user(
      user_id,
      order_by=MemoryFact.importance.desc(),
      extra_filters=(_current(), MemoryFact.status != MemoryStatus.rejected, or_(*matches)),
      limit=limit,
    )

  async def search(
    self,
    user_id: UUID,
    *,
    terms: Sequence[str],
    area: str | None,
    status: MemoryStatus | None,
    as_of: date | None,
    include_past: bool,
    limit: int,
  ) -> Sequence[MemoryFact]:
    filters: list[ColumnElement[bool]] = []
    haystack = func.concat_ws(" ", MemoryFact.area, MemoryFact.attribute, MemoryFact.statement)
    for term in terms:
      filters.append(haystack.ilike(f"%{_escape_like(term)}%", escape="\\"))
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
      .order_by(MemoryFact.importance.desc(), func.coalesce(MemoryFact.modified_at, MemoryFact.created_at).desc())
      .limit(limit)
    )
    return await self.get_all(statement)
