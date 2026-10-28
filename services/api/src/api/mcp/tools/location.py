"""Where the user has been and wants to go: saved places and Google Timeline history.

Location history is summarised to stays and trips; raw coordinates and route points never leave here.
"""

from datetime import date, datetime, time, timedelta
from datetime import timezone as fixed_offset
from typing import Annotated, Literal
from uuid import UUID

from mcp.server.mcpserver import Context
from pydantic import Field

from api.common.schemas import Schema
from api.location_history import place_names
from api.location_history.repository import LocationImportRepository, LocationSegmentRepository
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, local_window, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read
from api.models.location_segment import LocationSegment, LocationSegmentKind
from api.places.repository import PlaceRepository

MAX_LOCATION_DAYS = 31


class SavedPlace(Schema):
  id: UUID
  name: str
  address: str | None
  country: str | None
  status: Literal["want_to_go", "visited"]
  category: str | None = Field(description="E.g. restaurant, cafe, museum.")
  tags: list[str]
  rating: int | None = Field(description="The user's own rating, 1 to 5.")
  visited_at: date | None
  review: str | None = Field(description="The user's own notes on the place.")
  website: str | None


class SavedPlaces(Schema):
  places: list[SavedPlace] = Field(description="By name.")


async def get_places(
  ctx: Context,
  status: Annotated[Literal["want_to_go", "visited"] | None, Field(description="Only places the user wants to go to, or has been to.")] = None,
  query: Annotated[str | None, Field(description="Only places whose name, address, country or category contains this.")] = None,
  limit: Annotated[int, Field(ge=1, le=200)] = 50,
) -> SavedPlaces:
  """Places the user saved in Bessel's travel page: where they want to go and where they've been, with their ratings and notes.

  E.g. "which restaurants in Lisbon did I want to try" or "what did I think of that café".
  """
  async with user_session(ctx) as (session, user):
    rows = await PlaceRepository.from_session(session).list_saved(user.id, status=status, query=query, limit=limit)
  return SavedPlaces(
    places=[
      SavedPlace(
        id=p.id,
        name=p.name,
        address=p.address,
        country=p.country,
        status="visited" if p.status == "visited" else "want_to_go",
        category=p.category,
        tags=p.tags or [],
        rating=p.rating,
        visited_at=p.visited_at,
        review=p.review,
        website=p.website,
      )
      for p in rows
    ]
  )


class Stay(Schema):
  place: str | None = Field(description="The place's name; null when it couldn't be looked up.")
  address: str | None
  label: str | None = Field(description="Google's label for the place, e.g. HOME, WORK, SEARCHED_ADDRESS.")
  saved: bool = Field(description="Whether it's one of the user's saved places.")
  inside_another: bool = Field(description="A stay within a longer one, like a shop inside a mall.")
  start: datetime = Field(description="In the timezone where it happened, cut to the day.")
  end: datetime
  duration_secs: int


class Trip(Schema):
  mode: str | None = Field(description="How Google thinks the user moved, e.g. WALKING, IN_PASSENGER_VEHICLE, FLYING.")
  start: datetime = Field(description="In the timezone where it happened.")
  end: datetime
  duration_secs: int
  distance_m: float | None


class LocationDay(Schema):
  date: date
  stays: list[Stay] = Field(description="By start time.")
  trips: list[Trip] = Field(description="Trips that started on the day, by start time.")


class PlaceTotal(Schema):
  place: str | None
  label: str | None
  days: int = Field(description="Days with a stay there.")
  total_secs: int


class LocationHistory(Schema):
  days: list[LocationDay] = Field(description="Oldest first; a day without recorded visits or trips is missing.")
  places: list[PlaceTotal] = Field(description="Time per place across the range, most first. Stays inside another aren't counted twice.")
  last_import: datetime | None = Field(description="The latest moment the imported Google Timeline covers; nothing after it is known.")


def _offset(segment: LocationSegment) -> fixed_offset:
  return fixed_offset(timedelta(minutes=segment.utc_offset_minutes or 0))


def _day_parts(segment: LocationSegment, first: date, last: date) -> list[tuple[date, datetime, datetime]]:
  """The local days `segment` overlaps within first..last, each with the segment cut to that day."""
  parts = []
  day = max(segment.local_start.date(), first)
  while day <= min(segment.local_end.date(), last):
    start = max(segment.local_start, datetime.combine(day, time.min))
    end = min(segment.local_end, datetime.combine(day + timedelta(days=1), time.min))
    if end > start:
      parts.append((day, start, end))
    day += timedelta(days=1)
  return parts


async def get_location_history(ctx: Context, start: Day = "today", end: Day = "today", timezone: TimezoneParam = None) -> LocationHistory:
  """Where the user was, from their imported Google Timeline: stays per place and trips per day, plus time per place.

  Days and times are in the local time where the user was, so a trip abroad reads in that country's clock. E.g. "where was I
  last Saturday", "how many days was I at the office this month", "when did I get home yesterday". At most 31 days at a time.
  """
  async with user_session(ctx) as (session, user):
    tz = resolve_timezone(user, timezone)
    first, last = parse_day(start, today_in(tz)), parse_day(end, today_in(tz))
    local_window(first, last, tz, max_days=MAX_LOCATION_DAYS)
    segments = await LocationSegmentRepository.from_session(session).list_stays_and_trips(user.id, first, last)
    visits = [s for s in segments if s.kind == LocationSegmentKind.visit]
    place_ids = {v.place_id for v in visits if v.place_id}
    saved = await PlaceRepository.from_session(session).by_google_place_ids(user.id, place_ids)
    last_import = await LocationImportRepository.from_session(session).latest(user.id)
  looked_up = await place_names.look_up(place_ids - saved.keys())

  def name_of(place_id: str | None) -> tuple[str | None, str | None]:
    if place_id is None:
      return None, None
    if place_id in saved:
      return saved[place_id].name, saved[place_id].address
    found = looked_up.get(place_id)
    return (found.name, found.address) if found else (None, None)

  days: dict[date, LocationDay] = {}
  totals: dict[str | None, tuple[str | None, set[date], float]] = {}
  for visit in visits:
    name, address = name_of(visit.place_id)
    nested = (visit.hierarchy_level or 0) > 0
    for day, part_start, part_end in _day_parts(visit, first, last):
      secs = (part_end - part_start).total_seconds()
      days.setdefault(day, LocationDay(date=day, stays=[], trips=[])).stays.append(
        Stay(
          place=name,
          address=address,
          label=visit.semantic_type,
          saved=visit.place_id in saved,
          inside_another=nested,
          start=part_start.replace(tzinfo=_offset(visit)),
          end=part_end.replace(tzinfo=_offset(visit)),
          duration_secs=round(secs),
        )
      )
      if not nested:
        key = visit.place_id or visit.semantic_type
        label, seen, total = totals.get(key, (visit.semantic_type, set(), 0.0))
        totals[key] = (label, seen | {day}, total + secs)

  for trip in (s for s in segments if s.kind == LocationSegmentKind.activity):
    day = trip.local_start.date()
    if first <= day <= last:
      days.setdefault(day, LocationDay(date=day, stays=[], trips=[])).trips.append(
        Trip(
          mode=trip.activity_type,
          start=trip.local_start.replace(tzinfo=_offset(trip)),
          end=trip.local_end.replace(tzinfo=_offset(trip)),
          duration_secs=round((trip.end_at - trip.start_at).total_seconds()),
          distance_m=trip.distance_meters,
        )
      )

  place_totals = [
    PlaceTotal(place=name_of(key)[0] if key in place_ids else None, label=label, days=len(seen), total_secs=round(total))
    for key, (label, seen, total) in totals.items()
  ]
  return LocationHistory(
    days=[days[day] for day in sorted(days)],
    places=sorted(place_totals, key=lambda p: p.total_secs, reverse=True),
    last_import=last_import.as_of if last_import else None,
  )


TOOLS: list[ToolSpec] = [
  read(get_places, "Saved places"),
  read(get_location_history, "Location history"),
]
