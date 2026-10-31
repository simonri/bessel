"""What assistants know about the user, kept as facts with evidence.

Writes search before they store: the same fact again only confirms it, and a
different value for something already known is refused until the caller says
whether it replaces, merges or corrects the old one. Nothing is overwritten or
deleted from here; changed facts close and keep their history.
"""

import re
from collections import Counter
from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any
from uuid import UUID

import structlog

from api.common.utils import utc_now
from api.exceptions import ResourceNotFound, ValidationError
from api.memory import ranking
from api.memory.embeddings import Embedder, embedding_key, get_embedder
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
  SensitivityCount,
)
from api.models.memory_fact import MemoryFact, MemoryKind, MemorySensitivity, MemoryStatus
from api.models.user import User
from api.postgres import AsyncSession

log = structlog.get_logger()

PROFILE_MIN_IMPORTANCE = 4
# About 2k tokens: past that a profile crowds out the task and pulls answers towards agreeing with the user.
PROFILE_MAX_CHARS = 8000
RECENT_DAYS = 7
RECENT_MAX = 30
MAX_EVIDENCE = 20
SIMILAR_MAX = 5
MIN_WORD_LENGTH = 4
INFERRED_CONFIRMATIONS = 3
# How close in meaning another fact must be to be shown next to a new one, to merge with or check against: the
# closest 1% of pairs among the user's real facts with paraphrase-multilingual-mpnet-base-v2 (Oct 2026).
RELATED_MIN_SIMILARITY = 0.62
# Content other people wrote. What is seen only there stays an unimportant hypothesis, out of the profile, until the
# user raises it, so a line planted in an email can't become part of who they are.
EXTERNAL_SOURCES = frozenset({"gmail", "email", "slack", "web"})
EXTERNAL_MAX_IMPORTANCE = 3


def _normalize(text: str) -> str:
  return re.sub(r"\s+", " ", text).strip().casefold()


# Words too common in attributes to say two facts are about the same thing.
COMMON_WORDS = frozenset(
  {"varför", "vill", "inte", "eller", "från", "till", "efter", "före", "under", "över", "utan", "mest", "andra", "annat", "nya", "nytt", "sista"}
)


def _words(text: str) -> list[str]:
  return [word for word in re.findall(r"\w+", text.casefold()) if len(word) >= MIN_WORD_LENGTH and word not in COMMON_WORDS]


def _query_words(query: str) -> list[str]:
  return re.findall(r"\w+", query.casefold())


def _document(fact: MemoryFact) -> str:
  """What a fact's meaning is computed from: its place in memory as context for the statement."""
  return f"{fact.area} / {fact.attribute}: {fact.statement}"


def _external_only(evidence: Sequence[Evidence]) -> bool:
  return bool(evidence) and all(item.source.casefold() in EXTERNAL_SOURCES for item in evidence)


def _default_status(kind: MemoryKind, evidence: Sequence[Evidence] = ()) -> MemoryStatus:
  if kind == MemoryKind.inferred or (kind == MemoryKind.observed and _external_only(evidence)):
    return MemoryStatus.hypothesis
  return MemoryStatus.confirmed


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
  async def profile(self, session: AsyncSession, user: User, *, today: date, sensitive: Sequence[MemorySensitivity] = ()) -> MemoryProfile:
    facts = await MemoryFactRepository.from_session(session).list_current(user.id)
    shown = {MemorySensitivity.normal, *sensitive}
    core = sorted(
      (fact for fact in facts if fact.importance >= PROFILE_MIN_IMPORTANCE),
      key=lambda fact: (-fact.importance, -(fact.confirmed_at or fact.created_at).timestamp()),
    )
    withheld = Counter(fact.sensitivity for fact in core if fact.sensitivity not in shown)

    by_area: dict[str, list[ProfileFact]] = {}
    size = 0
    truncated = False
    for fact in (fact for fact in core if fact.sensitivity in shown):
      size += len(fact.statement)
      if size > PROFILE_MAX_CHARS:
        truncated = True
        break
      by_area.setdefault(fact.area, []).append(_brief(fact))

    counts: dict[str, int] = {}
    for fact in facts:
      counts[fact.area] = counts.get(fact.area, 0) + 1

    since = today - timedelta(days=RECENT_DAYS)
    recent = sorted(
      (fact for fact in facts if fact.sensitivity in shown and (fact.modified_at or fact.created_at).date() >= since),
      key=lambda fact: fact.modified_at or fact.created_at,
      reverse=True,
    )
    return MemoryProfile(
      profile=[ProfileArea(area=area, facts=items) for area, items in sorted(by_area.items())],
      areas=[AreaCount(area=area, facts=count) for area, count in sorted(counts.items())],
      recently_changed=[_brief(fact) for fact in recent[:RECENT_MAX]],
      withheld=[SensitivityCount(sensitivity=kind, facts=count) for kind, count in sorted(withheld.items())],
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
    repository = MemoryFactRepository.from_session(session)
    filters = {"area": area, "status": status, "as_of": as_of, "include_past": include_past}
    if not query:
      return [to_schema(fact) for fact in await repository.search(user.id, **filters, limit=limit)]
    words = _query_words(query)
    candidates = await repository.list_with_mentions(user.id, words, **filters)
    by_words, loose = ranking.by_words(candidates)
    facts = [fact for fact, _ in candidates]
    similarity: dict[UUID, float] = {}
    embedder = get_embedder()
    if embedder is not None:
      vectors = await self._vectors(repository, facts, embedder)
      try:
        similarity = ranking.cosines(vectors, await embedder.query(query)) if vectors else {}
      except Exception:
        log.exception("Memory search by meaning failed; searching by words only")
    found = ranking.fuse(by_words, loose, ranking.by_meaning(facts, similarity), similarity)
    return [to_schema(fact) for fact in found[:limit]]

  async def embed_current_facts(self, session: AsyncSession) -> None:
    """Computes the meaning of every user's current facts that lack an up-to-date one."""
    embedder = get_embedder()
    if embedder is None:
      return
    repository = MemoryFactRepository.from_session(session)
    await self._vectors(repository, await repository.list_current_for_everyone(), embedder)

  async def _vectors(self, repository: MemoryFactRepository, facts: Sequence[MemoryFact], embedder: Embedder) -> dict[UUID, list[float]]:
    """Each fact's meaning, computing what is missing or out of date first. Empty if the model can't run."""
    keys = {fact.id: embedding_key(embedder.model, _document(fact)) for fact in facts}
    stale = [fact for fact in facts if fact.embedding is None or fact.embedding_key != keys[fact.id]]
    if stale:
      try:
        embeddings = await embedder.documents([_document(fact) for fact in stale])
      except Exception:
        log.exception("Embedding memory facts failed; searching by words only", facts=len(stale))
        return {}
      for fact, embedding in zip(stale, embeddings, strict=True):
        await repository.store_embedding(fact, embedding, keys[fact.id])
    return {fact.id: fact.embedding for fact in facts if fact.embedding is not None}

  async def _near(self, repository: MemoryFactRepository, user: User, fact: MemoryFact) -> list[MemoryFact]:
    """Current facts close in meaning to `fact`, nearest first: the same thing said differently, or something that
    bears on it."""
    embedder = get_embedder()
    if embedder is None:
      return []
    facts = await repository.list_current(user.id)
    vectors = await self._vectors(repository, facts, embedder)
    if fact.id not in vectors:
      return []
    others = {id_: vector for id_, vector in vectors.items() if id_ != fact.id}
    similarity = ranking.cosines(others, vectors[fact.id])
    near = sorted((other for other in facts if similarity.get(other.id, 0.0) >= RELATED_MIN_SIMILARITY), key=lambda other: -similarity[other.id])
    return near[: SIMILAR_MAX + 1]

  async def remember(self, session: AsyncSession, user: User, items: Sequence[NewFact], *, today: date) -> list[RememberResult]:
    repository = MemoryFactRepository.from_session(session)
    results: list[RememberResult] = []
    for item in items:
      checked = await repository.list_current_by_ids(user.id, item.based_on)
      if item.kind == MemoryKind.inferred and not checked:
        results.append(RememberResult(outcome="unchecked", fact=None))
        continue
      existing = await repository.get_current_for_attribute(user.id, item.attribute, area=item.area)
      same = next((fact for fact in existing if _normalize(fact.statement) == _normalize(item.statement)), None)
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
        status=item.status or _default_status(item.kind, item.evidence),
        importance=min(item.importance, EXTERNAL_MAX_IMPORTANCE) if _external_only(item.evidence) else item.importance,
        sensitivity=item.sensitivity,
        evidence=_merged_evidence([], [*item.evidence, *(Evidence(source="memory", ref=str(other.id)) for other in checked)]),
        valid_from=item.valid_from or today,
        confirmed_at=utc_now(),
        confirm_count=1,
      )
      await repository.create(fact, flush=True)
      # The same attribute in another area first: the likeliest duplicate. Then facts close in meaning, which may say
      # the same or contradict it.
      elsewhere = await repository.get_current_for_attribute(user.id, item.attribute)
      by_words = await repository.list_current_matching_words(user.id, _words(item.attribute), limit=SIMILAR_MAX + 1)
      near = await self._near(repository, user, fact)
      seen = {fact.id, *(other.id for other in checked)}
      similar = list({other.id: other for other in [*elsewhere, *by_words, *near] if other.id not in seen}.values())
      results.append(RememberResult(outcome="added", fact=to_schema(fact), similar=[_brief(other) for other in similar[:SIMILAR_MAX]]))
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

  async def _ensure_free(self, repository: MemoryFactRepository, user: User, fact: MemoryFact, area: str | None, attribute: str | None) -> None:
    """Moving `fact` to `area`/`attribute` must not give that area two current facts about one attribute."""
    area, attribute = (area or fact.area).strip(), (attribute or fact.attribute).strip()
    taken = [other for other in await repository.get_current_for_attribute(user.id, attribute, area=area) if other.id != fact.id]
    if taken:
      raise ValidationError(f"'{attribute}' in {area} is already known as fact {taken[0].id}; merge into it instead")

  async def _revise_one(self, session: AsyncSession, user: User, change: FactChange, *, today: date) -> MemoryFact:
    repository = MemoryFactRepository.from_session(session)
    fact = await self._current_fact(repository, user, change.fact_id)
    ended_on = change.ended_on or today

    if change.action == "confirm":
      _confirm(fact, change.evidence, promote=True)
      await session.flush()
      return fact

    if change.action == "update":
      await self._ensure_free(repository, user, fact, change.area, change.attribute)
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
      await self._ensure_free(repository, user, fact, change.area, change.attribute)
      fact.valid_to = ended_on
      await session.flush()
      kind = change.kind or fact.kind
      replacement = MemoryFact(
        user_id=user.id,
        area=(change.area or fact.area).strip(),
        attribute=(change.attribute or fact.attribute).strip(),
        statement=change.statement.strip(),
        kind=kind,
        status=_default_status(kind, change.evidence),
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
    await self._ensure_free(repository, user, fact, update.area, update.attribute)
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
