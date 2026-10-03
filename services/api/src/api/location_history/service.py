import asyncio
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID

from api.location_history import place_names
from api.location_history.merge import plan_merge
from api.location_history.parser import ParsedSegment, TimelineFormatError, parse_timeline
from api.location_history.repository import LocationImportRepository, LocationSegmentRepository
from api.location_history.schemas import LocationActivity, LocationDay, LocationHistorySummary, LocationImportSchema, LocationPoint, LocationVisit
from api.models.location_import import LocationImport
from api.models.location_segment import LocationSegment, LocationSegmentKind


def _local(at: datetime, offset_minutes: int | None) -> datetime:
  return (at.astimezone(UTC) + timedelta(minutes=offset_minutes or 0)).replace(tzinfo=None)


def _row(user_id: UUID, segment: ParsedSegment, as_of: datetime) -> dict[str, Any]:
  def lat_lng(value: tuple[float, float] | None) -> tuple[float | None, float | None]:
    return value if value is not None else (None, None)

  latitude, longitude = lat_lng(segment.location)
  start_latitude, start_longitude = lat_lng(segment.start_location)
  end_latitude, end_longitude = lat_lng(segment.end_location)
  return {
    "user_id": user_id,
    "segment_key": segment.key,
    "content_hash": segment.content_hash,
    "observed_at": as_of,
    "kind": segment.kind,
    "start_at": segment.start_at,
    "end_at": segment.end_at,
    "utc_offset_minutes": segment.utc_offset_minutes,
    "local_start": _local(segment.start_at, segment.utc_offset_minutes),
    "local_end": _local(segment.end_at, segment.utc_offset_minutes),
    "place_id": segment.place_id,
    "semantic_type": segment.semantic_type,
    "hierarchy_level": segment.hierarchy_level,
    "latitude": latitude,
    "longitude": longitude,
    "activity_type": segment.activity_type,
    "distance_meters": segment.distance_meters,
    "start_latitude": start_latitude,
    "start_longitude": start_longitude,
    "end_latitude": end_latitude,
    "end_longitude": end_longitude,
    "points": segment.points,
  }


def covered_days(spans: list[tuple[datetime, datetime]]) -> list[date]:
  days: set[date] = set()
  for start, end in spans:
    # A visit ending exactly at midnight doesn't reach into the next day.
    last = (end - timedelta(microseconds=1)).date() if end > start else start.date()
    day = start.date()
    while day <= last:
      days.add(day)
      day += timedelta(days=1)
  return sorted(days)


class LocationHistoryService:
  async def import_export(
    self,
    segment_repo: LocationSegmentRepository,
    import_repo: LocationImportRepository,
    user_id: UUID,
    content: bytes,
    filename: str | None,
  ) -> LocationImport:
    # Parsing a large export is CPU-bound; keep it off the event loop.
    timeline = await asyncio.to_thread(parse_timeline, content)
    range_start, range_end = timeline.range_start, timeline.range_end
    if range_start is None or range_end is None:
      raise TimelineFormatError("The export is empty: there's no Timeline data on the phone it came from.")
    as_of = range_end

    await segment_repo.lock_for_import(user_id)
    stored = await segment_repo.stored_for_merge(user_id)
    plan = plan_merge(timeline.segments, stored, as_of, range_start, range_end)

    await segment_repo.upsert([_row(user_id, s, as_of) for s in plan.upserts])
    await segment_repo.confirm(user_id, plan.confirmed, as_of)
    await segment_repo.soft_delete(user_id, plan.removed, as_of)

    record = LocationImport(
      user_id=user_id,
      filename=filename,
      format=timeline.format,
      as_of=as_of,
      range_start=range_start,
      range_end=range_end,
      segments=len(timeline.segments),
      added=plan.added,
      updated=plan.updated,
      removed=len(plan.removed),
      unchanged=plan.unchanged,
      stale=plan.stale,
    )
    return await import_repo.create(record, flush=True)

  async def summary(
    self,
    segment_repo: LocationSegmentRepository,
    import_repo: LocationImportRepository,
    user_id: UUID,
  ) -> LocationHistorySummary:
    last_import = await import_repo.latest(user_id)
    return LocationHistorySummary(
      days=covered_days(await segment_repo.local_spans(user_id)),
      last_import=LocationImportSchema.model_validate(last_import) if last_import else None,
      place_names=place_names.can_look_up(),
    )

  async def day(self, segment_repo: LocationSegmentRepository, user_id: UUID, day: date) -> LocationDay:
    segments = await segment_repo.list_for_local_day(user_id, day)
    visits = [s for s in segments if s.kind == LocationSegmentKind.visit]
    names = await place_names.look_up({v.place_id for v in visits if v.place_id})
    return LocationDay(
      date=day,
      visits=[self._visit(v, names.get(v.place_id) if v.place_id else None) for v in visits],
      activities=[self._activity(s) for s in segments if s.kind == LocationSegmentKind.activity],
      path=self._path(day, [s for s in segments if s.kind == LocationSegmentKind.path]),
    )

  @staticmethod
  def _visit(segment: LocationSegment, name: place_names.PlaceName | None) -> LocationVisit:
    return LocationVisit(
      id=segment.id,
      start_at=segment.start_at,
      end_at=segment.end_at,
      utc_offset_minutes=segment.utc_offset_minutes,
      place_id=segment.place_id,
      name=name.name if name else None,
      address=name.address if name else None,
      semantic_type=segment.semantic_type,
      hierarchy_level=segment.hierarchy_level or 0,
      latitude=segment.latitude,
      longitude=segment.longitude,
    )

  @staticmethod
  def _activity(segment: LocationSegment) -> LocationActivity:
    return LocationActivity(
      id=segment.id,
      start_at=segment.start_at,
      end_at=segment.end_at,
      utc_offset_minutes=segment.utc_offset_minutes,
      activity_type=segment.activity_type,
      distance_meters=segment.distance_meters,
      start_latitude=segment.start_latitude,
      start_longitude=segment.start_longitude,
      end_latitude=segment.end_latitude,
      end_longitude=segment.end_longitude,
    )

  @staticmethod
  def _path(day: date, segments: list[LocationSegment]) -> list[LocationPoint]:
    """Route points that fall on the day in their own local time."""
    day_start = datetime.combine(day, time.min)
    points: list[LocationPoint] = []
    for segment in segments:
      offset = timedelta(minutes=segment.utc_offset_minutes or 0)
      start_ts = int((day_start - offset).replace(tzinfo=UTC).timestamp())
      end_ts = start_ts + 86400
      points.extend(LocationPoint(latitude=lat, longitude=lng, ts=int(ts)) for lat, lng, ts in segment.points or [] if start_ts <= ts < end_ts)
    return sorted(points, key=lambda p: p.ts)


location_history_service = LocationHistoryService()
