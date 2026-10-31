from datetime import UTC, datetime
from uuid import uuid4

from api.memory import ranking
from api.models.memory_fact import MemoryFact


def fact(importance: int = 3) -> MemoryFact:
  return MemoryFact(id=uuid4(), importance=importance, created_at=datetime(2026, 10, 1, tzinfo=UTC), modified_at=None)


class TestByMeaning:
  def test_stops_where_facts_fall_clearly_behind_the_nearest(self) -> None:
    nearest, close, far = fact(), fact(), fact()

    found = ranking.by_meaning([far, close, nearest], {nearest.id: 0.9, close.id: 0.85, far.id: 0.7})

    assert found == [nearest, close]


class TestFuse:
  def test_when_both_rankings_disagree_the_closer_meaning_goes_first(self) -> None:
    closer, important = fact(importance=1), fact(importance=5)

    fused = ranking.fuse([important, closer], False, [closer, important], {closer.id: 0.9, important.id: 0.88})

    assert fused == [closer, important]

  def test_what_both_rankings_found_goes_first(self) -> None:
    both, words_only, meaning_only = fact(), fact(), fact()

    fused = ranking.fuse([words_only, both], False, [meaning_only, both], {both.id: 0.8, meaning_only.id: 0.85})

    assert fused[0] == both
