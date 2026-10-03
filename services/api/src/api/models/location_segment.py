from datetime import datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, Float, ForeignKey, Index, Integer, SmallInteger, String, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class LocationSegmentKind(StrEnum):
  visit = "visit"
  activity = "activity"
  path = "path"


class LocationSegment(RecordModel):
  """One visit, trip or stretch of route from an imported Google Timeline.

  Rows are never hard-deleted by an import: a segment the phone no longer has
  is soft-deleted, and the tombstone stops an older export bringing it back.
  """

  __tablename__ = "location_segments"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
  # Identity across exports: kind, exact start and end, and visit nesting level.
  segment_key: Mapped[str] = mapped_column(String(64), nullable=False)
  # Changes when the segment's content does, e.g. a visit moved to another place.
  content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
  # The as-of time of the export that last decided this row's state.
  observed_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)

  kind: Mapped[LocationSegmentKind] = mapped_column(String(16), nullable=False)
  start_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  end_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  utc_offset_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
  # Wall-clock time where the segment happened, so days follow the trip's
  # time zone rather than the viewer's.
  local_start: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=False), nullable=False)
  local_end: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=False), nullable=False)

  place_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
  semantic_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
  hierarchy_level: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
  latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
  longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

  activity_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
  distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
  start_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
  start_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
  end_latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
  end_longitude: Mapped[float | None] = mapped_column(Float, nullable=True)

  # [[lat, lng, unix seconds], …]
  points: Mapped[list[list[Any]] | None] = mapped_column(JSONB, nullable=True)

  __table_args__ = (
    UniqueConstraint("user_id", "segment_key", name="location_segments_user_id_segment_key_key"),
    Index("ix_location_segments_user_id_local_start", "user_id", "local_start"),
  )
