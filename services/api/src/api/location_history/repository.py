from collections.abc import Iterator, Sequence
from datetime import date, datetime, time, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import utc_now
from api.location_history.merge import StoredSegment
from api.models.location_import import LocationImport
from api.models.location_segment import LocationSegment, LocationSegmentKind

# Postgres caps a statement at 32767 bind parameters; a segment row has ~25.
_UPSERT_CHUNK = 1000
_KEY_CHUNK = 5000

UPSERT_COLUMNS = [
  "content_hash",
  "observed_at",
  "kind",
  "start_at",
  "end_at",
  "utc_offset_minutes",
  "local_start",
  "local_end",
  "place_id",
  "semantic_type",
  "hierarchy_level",
  "latitude",
  "longitude",
  "activity_type",
  "distance_meters",
  "start_latitude",
  "start_longitude",
  "end_latitude",
  "end_longitude",
  "points",
]


def _chunks[T](items: Sequence[T], size: int) -> Iterator[Sequence[T]]:
  for i in range(0, len(items), size):
    yield items[i : i + size]


class LocationSegmentRepository(RepositoryBase[LocationSegment], RepositoryIDMixin[LocationSegment, UUID]):
  model = LocationSegment

  async def lock_for_import(self, user_id: UUID) -> None:
    """Serializes imports per user until the transaction ends; two racing
    imports would otherwise each plan against the state before the other."""
    await self.session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": f"location_import:{user_id}"})

  async def stored_for_merge(self, user_id: UUID) -> dict[str, StoredSegment]:
    result = await self.session.execute(
      select(
        LocationSegment.segment_key,
        LocationSegment.content_hash,
        LocationSegment.observed_at,
        LocationSegment.deleted_at,
        LocationSegment.start_at,
        LocationSegment.end_at,
      ).where(LocationSegment.user_id == user_id)
    )
    return {
      key: StoredSegment(key=key, content_hash=content_hash, observed_at=observed_at, deleted=deleted_at is not None, start_at=start_at, end_at=end_at)
      for key, content_hash, observed_at, deleted_at, start_at, end_at in result.all()
    }

  async def upsert(self, rows: list[dict[str, Any]]) -> None:
    now = utc_now()
    for chunk in _chunks(rows, _UPSERT_CHUNK):
      statement = pg_insert(LocationSegment).values(list(chunk))
      statement = statement.on_conflict_do_update(
        constraint="location_segments_user_id_segment_key_key",
        set_={**{column: statement.excluded[column] for column in UPSERT_COLUMNS}, "modified_at": now, "deleted_at": None},
      )
      await self.session.execute(statement)

  async def confirm(self, user_id: UUID, keys: list[str], as_of: datetime) -> None:
    for chunk in _chunks(keys, _KEY_CHUNK):
      await self.session.execute(
        update(LocationSegment)
        .where(LocationSegment.user_id == user_id, LocationSegment.segment_key.in_(chunk), LocationSegment.observed_at < as_of)
        .values(observed_at=as_of)
      )

  async def soft_delete(self, user_id: UUID, keys: list[str], as_of: datetime) -> None:
    now = utc_now()
    for chunk in _chunks(keys, _KEY_CHUNK):
      await self.session.execute(
        update(LocationSegment)
        .where(LocationSegment.user_id == user_id, LocationSegment.segment_key.in_(chunk))
        .values(deleted_at=now, modified_at=now, observed_at=as_of)
      )

  async def list_for_local_day(self, user_id: UUID, day: date) -> Sequence[LocationSegment]:
    day_start = datetime.combine(day, time.min)
    statement = (
      self.get_base_statement()
      .where(
        LocationSegment.user_id == user_id,
        LocationSegment.deleted_at.is_(None),
        LocationSegment.local_start < day_start + timedelta(days=1),
        LocationSegment.local_end > day_start,
      )
      .order_by(LocationSegment.start_at, LocationSegment.hierarchy_level)
    )
    return await self.get_all(statement)

  async def local_spans(self, user_id: UUID) -> list[tuple[datetime, datetime]]:
    """Local start and end of every live visit and trip."""
    result = await self.session.execute(
      select(LocationSegment.local_start, LocationSegment.local_end).where(
        LocationSegment.user_id == user_id,
        LocationSegment.deleted_at.is_(None),
        LocationSegment.kind != LocationSegmentKind.path,
      )
    )
    return [(start, end) for start, end in result.all()]


class LocationImportRepository(RepositoryBase[LocationImport], RepositoryIDMixin[LocationImport, UUID]):
  model = LocationImport

  async def latest(self, user_id: UUID) -> LocationImport | None:
    statement = (
      self.get_base_statement()
      .where(LocationImport.user_id == user_id, LocationImport.deleted_at.is_(None))
      .order_by(LocationImport.created_at.desc())
      .limit(1)
    )
    return await self.get_one_or_none(statement)
