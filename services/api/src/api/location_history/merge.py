"""Decides what an imported export changes. Pure, so every case is testable
without a database.

An export is the phone's full knowledge as of its latest recorded moment
(`as_of`), for the span it covers. So, per segment key:

- Newer knowledge wins. A row last decided by a newer export is left alone,
  whether live or deleted, so re-importing an old backup never reverts an
  edit or brings back something deleted since.
- Inside the export's span, a live row the export no longer has was deleted
  (or edited into a different segment) on the phone, and is soft-deleted.
- Outside the span nothing is touched: a phone that only keeps recent
  months must not wipe older history.

Two different exports with the same `as_of` can't be ordered; the later
upload wins.
"""

from dataclasses import dataclass, field
from datetime import datetime

from api.location_history.parser import ParsedSegment


@dataclass(frozen=True, slots=True)
class StoredSegment:
  key: str
  content_hash: str
  observed_at: datetime
  deleted: bool
  start_at: datetime
  end_at: datetime


@dataclass(slots=True)
class MergePlan:
  # Inserted, revived or rewritten.
  upserts: list[ParsedSegment] = field(default_factory=list)
  # Already right; only their observed_at moves forward.
  confirmed: list[str] = field(default_factory=list)
  removed: list[str] = field(default_factory=list)
  added: int = 0
  updated: int = 0
  stale: int = 0

  @property
  def unchanged(self) -> int:
    return len(self.confirmed)


def plan_merge(
  segments: list[ParsedSegment],
  stored: dict[str, StoredSegment],
  as_of: datetime,
  range_start: datetime,
  range_end: datetime,
) -> MergePlan:
  plan = MergePlan()
  for segment in segments:
    row = stored.get(segment.key)
    if row is not None and row.observed_at > as_of:
      plan.stale += 1
    elif row is None or row.deleted:
      plan.upserts.append(segment)
      plan.added += 1
    elif row.content_hash != segment.content_hash:
      plan.upserts.append(segment)
      plan.updated += 1
    else:
      plan.confirmed.append(segment.key)

  in_file = {s.key for s in segments}
  plan.removed = [
    row.key
    for row in stored.values()
    if not row.deleted and row.key not in in_file and row.observed_at <= as_of and range_start <= row.start_at and row.end_at <= range_end
  ]
  return plan
