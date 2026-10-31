"""Ranking memory search results from two views of each fact: the words it mentions and what it means.

After gbrain's hybrid search: keyword and vector rankings are fused by reciprocal rank
(k=60), then blended with cosine similarity. Every query word must match before any
single one counts; when none match all, rare words count most, and those loose matches
only vote when meaning found nothing.
"""

from collections.abc import Mapping, Sequence
from uuid import UUID

import numpy as np

from api.models.memory_fact import MemoryFact

RRF_K = 60
RRF_WEIGHT = 0.7
# The nearest facts by meaning that take part, and how far below the nearest one they may be. With
# paraphrase-multilingual-mpnet-base-v2 on the user's real facts, the right answer sat at most 0.03 below the top
# and the fifth-nearest typically 0.1-0.3 below (Oct 2026).
VECTOR_CANDIDATES = 10
VECTOR_MARGIN = 0.08

Mentions = tuple[bool, ...]


def _newest_first(fact: MemoryFact) -> float:
  return -(fact.modified_at or fact.created_at).timestamp()


def by_words(candidates: Sequence[tuple[MemoryFact, Mentions]]) -> tuple[list[MemoryFact], bool]:
  """Facts mentioning every word, most important first; failing that, facts mentioning any, rare words weighing most.
  Says whether it had to fall back to any."""
  word_count = len(candidates[0][1]) if candidates else 0
  if not word_count:
    return [], False
  every = [fact for fact, mentions in candidates if all(mentions)]
  if every:
    return sorted(every, key=lambda fact: (-fact.importance, _newest_first(fact))), False
  frequency = [sum(mentions[index] for _, mentions in candidates) for index in range(word_count)]
  rarity = {fact.id: sum(1 / frequency[index] for index, mentioned in enumerate(mentions) if mentioned) for fact, mentions in candidates}
  some = [fact for fact, _ in candidates if rarity[fact.id] > 0]
  return sorted(some, key=lambda fact: (-rarity[fact.id], -fact.importance)), True


def cosines(vectors: Mapping[UUID, Sequence[float]], query: Sequence[float]) -> dict[UUID, float]:
  if not vectors:
    return {}
  ids = list(vectors)
  matrix = np.array([vectors[id_] for id_ in ids], dtype=np.float32)
  target = np.array(query, dtype=np.float32)
  norms = np.linalg.norm(matrix, axis=1) * np.linalg.norm(target)
  similarity = np.divide(matrix @ target, norms, out=np.zeros(len(ids), dtype=np.float32), where=norms > 0)
  return dict(zip(ids, (float(value) for value in similarity), strict=True))


def by_meaning(facts: Sequence[MemoryFact], similarity: Mapping[UUID, float]) -> list[MemoryFact]:
  """The facts nearest in meaning, cut where they fall clearly behind the nearest."""
  ranked = sorted((fact for fact in facts if similarity.get(fact.id, 0.0) > 0), key=lambda fact: -similarity[fact.id])
  if not ranked:
    return []
  floor = similarity[ranked[0].id] - VECTOR_MARGIN
  return [fact for fact in ranked[:VECTOR_CANDIDATES] if similarity[fact.id] >= floor]


def fuse(words: Sequence[MemoryFact], loose: bool, meaning: Sequence[MemoryFact], similarity: Mapping[UUID, float]) -> list[MemoryFact]:
  rankings = [list(meaning)]
  if words and not (loose and meaning):
    rankings.append(list(words))
  votes: dict[UUID, float] = {}
  facts: dict[UUID, MemoryFact] = {}
  for ranking in rankings:
    for rank, fact in enumerate(ranking, start=1):
      votes[fact.id] = votes.get(fact.id, 0.0) + 1 / (RRF_K + rank)
      facts[fact.id] = fact
  if not votes:
    return []
  top = max(votes.values())
  score = {id_: RRF_WEIGHT * vote / top + (1 - RRF_WEIGHT) * max(similarity.get(id_, 0.0), 0.0) for id_, vote in votes.items()}
  return sorted(facts.values(), key=lambda fact: (-score[fact.id], -fact.importance))
