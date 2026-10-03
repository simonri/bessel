from datetime import date, datetime
from uuid import UUID

from pydantic import Field

from api.common.schemas import Schema


class LocationImportSchema(Schema):
  id: UUID
  created_at: datetime
  filename: str | None
  format: str = Field(description="ios or android.")
  as_of: datetime = Field(description="The export's latest recorded moment.")
  range_start: datetime
  range_end: datetime
  segments: int = Field(description="Visits, trips and route stretches read from the file.")
  added: int
  updated: int
  removed: int = Field(description="Segments the phone no longer has, within the export's span.")
  unchanged: int
  stale: int = Field(description="Segments skipped because a newer export already decided them.")


class LocationHistorySummary(Schema):
  days: list[date] = Field(description="Local dates with at least one visit or trip, ascending.")
  last_import: LocationImportSchema | None
  place_names: bool = Field(description="Whether place names can be looked up.")


class LocationVisit(Schema):
  id: UUID
  start_at: datetime
  end_at: datetime
  utc_offset_minutes: int | None = Field(description="UTC offset where the visit happened.")
  place_id: str | None = Field(description="Google place ID.")
  name: str | None = Field(description="The place's name, when it could be looked up.")
  address: str | None
  semantic_type: str | None = Field(description="Google's label for the place, e.g. Home, Work, Searched Address.")
  hierarchy_level: int = Field(description="0 for a top-level visit; higher for a visit inside another, like a shop in a mall.")
  latitude: float | None
  longitude: float | None


class LocationActivity(Schema):
  id: UUID
  start_at: datetime
  end_at: datetime
  utc_offset_minutes: int | None
  activity_type: str | None = Field(description="How Google thinks you moved, e.g. walking, in passenger vehicle, flying.")
  distance_meters: float | None
  start_latitude: float | None
  start_longitude: float | None
  end_latitude: float | None
  end_longitude: float | None


class LocationPoint(Schema):
  latitude: float
  longitude: float
  ts: int = Field(description="Unix epoch seconds.")


class LocationDay(Schema):
  date: date
  visits: list[LocationVisit] = Field(description="Visits overlapping the day, by start time.")
  activities: list[LocationActivity] = Field(description="Trips overlapping the day, by start time.")
  path: list[LocationPoint] = Field(description="Recorded route points within the day, by time.")
