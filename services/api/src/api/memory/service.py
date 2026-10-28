"""What assistants know about the user, kept as facts with evidence.

Writes search before they store: the same fact again only confirms it, and a
different value for something already known is refused until the caller says
whether it replaces, merges or corrects the old one. Nothing is overwritten or
deleted from here; changed facts close and keep their history.
"""

import re
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any
from uuid import UUID

from api.common.utils import utc_now
from api.exceptions import ResourceNotFound, ValidationError
from api.memory.repository import MemoryFactRepository
from api.memory.schemas import (
  AreaCount,
  Evidence,
  FactChange,
  MemoryFactSchema,
  MemoryFactUpdate,
  MemoryProfile,
  NewFact,
  ProfileArea,
  ProfileFact,
  RememberResult,
  ReviseResult,
)
from api.models.memory_fact import MemoryFact, MemoryKind, MemoryStatus
from api.models.user import User
from api.postgres import AsyncSession

PROFILE_MIN_IMPORTANCE = 4
PROFILE_MAX_FACTS = 150
RECENT_DAYS = 7
RECENT_MAX = 30
MAX_EVIDENCE = 20
SIMILAR_MAX = 5
MIN_WORD_LENGTH = 4
INFERRED_CONFIRMATIONS = 3


def _normalize(text: str) -> str:
  return re.sub(r"\s+", " ", text).strip().casefold()


def _words(text: str) -> list[str]:
  return [word for word in re.findall(r"\w+", text.casefold()) if len(word) >= MIN_WORD_LENGTH]


def _default_status(kind: MemoryKind) -> MemoryStatus:
  return MemoryStatus.hypothesis if kind == MemoryKind.inferred else MemoryStatus.confirmed


def _merged_evidence(existing: Sequence[dict[str, Any]], added: Sequence[Evidence]) -> list[dict[str, Any]]:
  merged = list(existing)
  for item in added:
    entry = item.model_dump(mode="json", exclude_none=True)
    if entry not in merged:
      merged.append(entry)
  return merged[-MAX_EVIDENCE:]


def to_schema(fact: MemoryFact) -> MemoryFactSchema:
  return MemoryFactSchema(
    id=fact.id,
    area=fact.area,
    attribute=fact.attribute,
    statement=fact.statement,
    kind=fact.kind,
    status=fact.status,
    importance=fact.importance,
    sensitivity=fact.sensitivity,
    evidence=[Evidence.model_validate(item) for item in fact.evidence],
    valid_from=fact.valid_from,
    valid_to=fact.valid_to,
    superseded_by_id=fact.superseded_by_id,
    confirm_count=fact.confirm_count,
    confirmed_at=fact.confirmed_at,
    created_at=fact.created_at,
    updated_at=fact.modified_at or fact.created_at,
  )


def _brief(fact: MemoryFact) -> ProfileFact:
  return ProfileFact(id=fact.id, attribute=fact.attribute, statement=fact.statement, status=fact.status)


def _confirm(fact: MemoryFact, evidence: Sequence[Evidence], *, promote: bool) -> None:
  fact.evidence = _merged_evidence(fact.evidence, evidence)
  fact.confirm_count += 1
  fact.confirmed_at = utc_now()
  if promote and fact.status == MemoryStatus.hypothesis:
    fact.status = MemoryStatus.confirmed


class MemoryService:
  async def profile(self, session: AsyncSession, user: User, *, today: date) -> MemoryProfile:
    facts = await MemoryFactRepository.from_session(session).list_current(user.id)
    core = [fact for fact in facts if fact.importance >= PROFILE_MIN_IMPORTANCE]
    truncated = len(core) > PROFILE_MAX_FACTS
    by_area: dict[str, list[ProfileFact]] = {}
    for fact in core[:PROFILE_MAX_FACTS]:
      by_area.setdefault(fact.area, []).append(_brief(fact))

    counts: dict[str, int] = {}
    for fact in facts:
      counts[fact.area] = counts.get(fact.area, 0) + 1

    since = today - timedelta(days=RECENT_DAYS)
    recent = sorted(
      (fact for fact in facts if (fact.modified_at or fact.created_at).date() >= since),
      key=lambda fact: fact.modified_at or fact.created_at,
      reverse=True,
    )
    return MemoryProfile(
      profile=[ProfileArea(area=area, facts=items) for area, items in sorted(by_area.items())],
      areas=[AreaCount(area=area, facts=count) for area, count in sorted(counts.items())],
      recently_changed=[_brief(fact) for fact in recent[:RECENT_MAX]],
      total_facts=len(facts),
      truncated=truncated,
    )

  async def search(
    self,
    session: AsyncSession,
    user: User,
    *,
    query: str | None,
    area: str | None,
    status: MemoryStatus | None,
    as_of: date | None,
    include_past: bool,
    limit: int,
  ) -> list[MemoryFactSchema]:
    terms = query.split() if query else []
    facts = await MemoryFactRepository.from_session(session).search(
      user.id, terms=terms, area=area, status=status, as_of=as_of, include_past=include_past, limit=limit
    )
    return [to_schema(fact) for fact in facts]

  async def remember(self, session: AsyncSession, user: User, items: Sequence[NewFact], *, today: date) -> list[RememberResult]:
    repository = MemoryFactRepository.from_session(session)
    results: list[RememberResult] = []
    for item in items:
      existing = await repository.get_current_for_attribute(user.id, item.attribute)
      same = next(
        (fact for fact in existing if _normalize(fact.area) == _normalize(item.area) and _normalize(fact.statement) == _normalize(item.statement)),
        None,
      )
      if same is not None:
        # A conclusion seen a third time, on its own evidence, stops being a guess.
        _confirm(same, item.evidence, promote=item.kind != MemoryKind.inferred or same.confirm_count + 1 >= INFERRED_CONFIRMATIONS)
        await session.flush()
        results.append(RememberResult(outcome="known", fact=to_schema(same)))
        continue
      if existing:
        results.append(RememberResult(outcome="conflict", fact=to_schema(existing[0])))
        continue

      fact = MemoryFact(
        user_id=user.id,
        area=item.area.strip(),
        attribute=item.attribute.strip(),
        statement=item.statement.strip(),
        kind=item.kind,
        status=item.status or _default_status(item.kind),
        importance=item.importance,
        sensitivity=item.sensitivity,
        evidence=_merged_evidence([], item.evidence),
        valid_from=item.valid_from or today,
        confirmed_at=utc_now(),
        confirm_count=1,
      )
      await repository.create(fact, flush=True)
      similar = await repository.list_current_matching_words(user.id, _words(item.attribute), limit=SIMILAR_MAX + 1)
      results.append(
        RememberResult(
          outcome="added",
          fact=to_schema(fact),
          similar=[_brief(other) for other in similar if other.id != fact.id][:SIMILAR_MAX],
        )
      )
    return results

  async def revise(self, session: AsyncSession, user: User, changes: Sequence[FactChange], *, today: date) -> list[ReviseResult]:
    results: list[ReviseResult] = []
    for change in changes:
      try:
        fact = await self._revise_one(session, user, change, today=today)
      except (ResourceNotFound, ValidationError) as error:
        results.append(ReviseResult(fact_id=change.fact_id, action=change.action, error=error.message))
        continue
      results.append(ReviseResult(fact_id=change.fact_id, action=change.action, fact=to_schema(fact)))
    return results

  async def _current_fact(self, repository: MemoryFactRepository, user: User, fact_id: UUID) -> MemoryFact:
    fact = await repository.get_owned_or_404(fact_id, user.id, not_found_message=f"No fact {fact_id}")
    if fact.valid_to is not None:
      raise ValidationError(f"Fact {fact_id} already ended; change the fact that replaced it instead")
    return fact

  async def _ensure_free(self, repository: MemoryFactRepository, user: User, attribute: str, *, keep: UUID) -> None:
    taken = [fact for fact in await repository.get_current_for_attribute(user.id, attribute) if fact.id != keep]
    if taken:
      raise ValidationError(f"'{attribute}' is already known as fact {taken[0].id}; merge into it instead")

  async def _revise_one(self, session: AsyncSession, user: User, change: FactChange, *, today: date) -> MemoryFact:
    repository = MemoryFactRepository.from_session(session)
    fact = await self._current_fact(repository, user, change.fact_id)
    ended_on = change.ended_on or today

    if change.action == "confirm":
      _confirm(fact, change.evidence, promote=True)
      await session.flush()
      return fact

    if change.action == "update":
      if change.attribute is not None and _normalize(change.attribute) != _normalize(fact.attribute):
        await self._ensure_free(repository, user, change.attribute, keep=fact.id)
      for field in ("statement", "area", "attribute", "importance", "sensitivity", "kind"):
        value = getattr(change, field)
        if value is not None:
          setattr(fact, field, value.strip() if isinstance(value, str) else value)
      fact.evidence = _merged_evidence(fact.evidence, change.evidence)
      fact.set_modified_at()
      await session.flush()
      return fact

    if change.action == "supersede":
      if change.statement is None:
        raise ValidationError("supersede needs the new statement")
      attribute = (change.attribute or fact.attribute).strip()
      if _normalize(attribute) != _normalize(fact.attribute):
        await self._ensure_free(repository, user, attribute, keep=fact.id)
      fact.valid_to = ended_on
      await session.flush()
      kind = change.kind or fact.kind
      replacement = MemoryFact(
        user_id=user.id,
        area=(change.area or fact.area).strip(),
        attribute=attribute,
        statement=change.statement.strip(),
        kind=kind,
        status=_default_status(kind),
        importance=change.importance or fact.importance,
        sensitivity=change.sensitivity or fact.sensitivity,
        evidence=_merged_evidence([], change.evidence),
        valid_from=ended_on,
        confirmed_at=utc_now(),
        confirm_count=1,
      )
      await repository.create(replacement, flush=True)
      fact.superseded_by_id = replacement.id
      await session.flush()
      return replacement

    if change.action == "merge":
      if change.into_id is None or change.into_id == fact.id:
        raise ValidationError("merge needs into_id, another current fact")
      target = await self._current_fact(repository, user, change.into_id)
      fact.valid_to = today
      fact.superseded_by_id = target.id
      target.evidence = _merged_evidence(target.evidence, [*map(Evidence.model_validate, fact.evidence), *change.evidence])
      target.confirm_count += fact.confirm_count
      target.importance = max(target.importance, fact.importance)
      if change.statement is not None:
        target.statement = change.statement.strip()
      target.set_modified_at()
      await session.flush()
      return target

    if change.action == "reject":
      fact.status = MemoryStatus.rejected
    fact.evidence = _merged_evidence(fact.evidence, change.evidence)
    fact.valid_to = ended_on
    await session.flush()
    return fact

  async def list_current(self, session: AsyncSession, user: User) -> list[MemoryFactSchema]:
    return [to_schema(fact) for fact in await MemoryFactRepository.from_session(session).list_current(user.id)]

  async def correct(self, session: AsyncSession, user: User, fact_id: UUID, update: MemoryFactUpdate) -> MemoryFactSchema:
    """The user fixed a fact by hand: it counts as theirs from now on."""
    repository = MemoryFactRepository.from_session(session)
    fact = await repository.get_owned_or_404(fact_id, user.id, not_found_message="Fact not found")
    if update.attribute is not None and _normalize(update.attribute) != _normalize(fact.attribute):
      await self._ensure_free(repository, user, update.attribute, keep=fact.id)
    for field in ("area", "attribute", "statement", "importance"):
      value = getattr(update, field)
      if value is not None:
        setattr(fact, field, value.strip() if isinstance(value, str) else value)
    fact.kind = MemoryKind.corrected
    fact.status = MemoryStatus.confirmed
    fact.confirmed_at = utc_now()
    fact.set_modified_at()
    await session.flush()
    return to_schema(fact)

  async def forget(self, session: AsyncSession, user: User, fact_id: UUID) -> None:
    """The user removed a fact on the web; assistants can't."""
    fact = await MemoryFactRepository.from_session(session).get_owned_or_404(fact_id, user.id, not_found_message="Fact not found")
    fact.set_deleted_at()
    await session.flush()


memory_service = MemoryService()
