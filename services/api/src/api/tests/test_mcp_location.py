from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from api.common.utils import utc_now
from api.location_history import place_names
from api.location_history.repository import LocationSegmentRepository
from api.models.location_import import LocationImport
from api.models.location_segment import LocationSegment, LocationSegmentKind
from api.models.place import Place
from api.models.user import User
from api.postgres import AsyncSession
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error
from pytest_mock import MockerFixture

STOCKHOLM = {"timezone": "Europe/Stockholm"}


@pytest.fixture(autouse=True)
def _no_place_names(monkeypatch: pytest.MonkeyPatch) -> None:
  monkeypatch.setattr(place_names.settings, "GOOGLE_PLACES_API_KEY", "")
  place_names.clear_cache()


def _segment(kind: LocationSegmentKind, local_start: datetime, local_end: datetime, *, offset: int = 120, **fields: Any) -> LocationSegment:
  """A segment at wall-clock `local_start`..`local_end` in a zone `offset` minutes from UTC."""
  shift = timedelta(minutes=offset)
  return LocationSegment(
    segment_key=f"{kind}-{local_start.isoformat()}-{fields.get('hierarchy_level')}",
    content_hash="hash",
    observed_at=datetime(2026, 10, 1, tzinfo=UTC),
    kind=kind,
    start_at=(local_start - shift).replace(tzinfo=UTC),
    end_at=(local_end - shift).replace(tzinfo=UTC),
    utc_offset_minutes=offset,
    local_start=local_start,
    local_end=local_end,
    **fields,
  )


def _visit(local_start: datetime, local_end: datetime, place_id: str | None, semantic_type: str | None = None, **fields: Any) -> LocationSegment:
  fields.setdefault("hierarchy_level", 0)
  return _segment(LocationSegmentKind.visit, local_start, local_end, place_id=place_id, semantic_type=semantic_type, latitude=59.33, longitude=18.06, **fields)


class TestGetPlaces:
  @pytest.mark.asyncio
  async def test_filters_by_status_and_query_and_skips_deleted(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    await save_owned(Place(name="Time Out Market", address="Lisbon", country="Portugal", latitude=38.7, longitude=-9.1, status="want_to_go", category="market"))
    await save_owned(
      Place(
        name="Café A Brasileira",
        country="Portugal",
        latitude=38.7,
        longitude=-9.1,
        status="visited",
        rating=4,
        visited_at=date(2026, 5, 2),
        review="Busy but good",
        tags=["coffee"],
      )
    )
    await save_owned(Place(name="Noma", country="Denmark", latitude=55.6, longitude=12.6, status="want_to_go"))
    await save_owned(Place(name="Closed café", country="Portugal", latitude=38.7, longitude=-9.1, status="visited", deleted_at=utc_now()))

    everything = (await mcp_call(connect, "get_places"))["places"]
    assert [p["name"] for p in everything] == ["Café A Brasileira", "Noma", "Time Out Market"]
    assert "latitude" not in everything[0]

    visited = (await mcp_call(connect, "get_places", {"status": "visited"}))["places"]
    assert [(p["name"], p["rating"], p["review"], p["tags"], p["visited_at"]) for p in visited] == [
      ("Café A Brasileira", 4, "Busy but good", ["coffee"], "2026-05-02")
    ]
    wanted = (await mcp_call(connect, "get_places", {"status": "want_to_go", "query": "portugal"}))["places"]
    assert [p["name"] for p in wanted] == ["Time Out Market"]

    assert (await mcp_call(connect, "get_places", token="token-b"))["places"] == []


class TestGetLocationHistory:
  @pytest.mark.asyncio
  async def test_stays_and_trips_per_local_day_without_coordinates(
    self, connect: ConnectFixture, save_owned: SaveFixture, save_fixture: SaveFixture, other_user: User, mocker: MockerFixture
  ) -> None:
    await save_owned(Place(name="The office", latitude=59.3, longitude=18.0, google_place_id="office-id"))
    await save_fixture(Place(name="Someone else's flat", latitude=59.3, longitude=18.0, google_place_id="home-id", user_id=other_user.id))
    look_up = mocker.patch.object(place_names, "look_up", return_value={"gym-id": place_names.PlaceName(name="SATS", address="Sveavägen 1")})
    # Home overnight from the 3rd into the 4th, then office with a café inside it, a walk, and the gym.
    await save_owned(_visit(datetime(2026, 10, 3, 22), datetime(2026, 10, 4, 8), "home-id", "HOME"))
    await save_owned(_visit(datetime(2026, 10, 4, 8, 30), datetime(2026, 10, 4, 12), "office-id"))
    await save_owned(_visit(datetime(2026, 10, 4, 10), datetime(2026, 10, 4, 10, 30), "cafe-id", hierarchy_level=1))
    await save_owned(
      _segment(
        LocationSegmentKind.activity,
        datetime(2026, 10, 4, 12),
        datetime(2026, 10, 4, 12, 20),
        activity_type="WALKING",
        distance_meters=1500.0,
        start_latitude=59.3,
        start_longitude=18.0,
      )
    )
    await save_owned(_visit(datetime(2026, 10, 4, 12, 20), datetime(2026, 10, 4, 13, 20), "gym-id"))
    # A night bus that leaves on the 3rd belongs to the 3rd only.
    await save_owned(_segment(LocationSegmentKind.activity, datetime(2026, 10, 3, 23, 50), datetime(2026, 10, 4, 0, 10), activity_type="IN_BUS"))
    await save_owned(_segment(LocationSegmentKind.path, datetime(2026, 10, 4, 8), datetime(2026, 10, 4, 9), points=[[59.3, 18.0, 1759557600]]))
    await save_owned(_visit(datetime(2026, 10, 4, 14), datetime(2026, 10, 4, 15), "removed-id", deleted_at=utc_now()))
    await save_owned(
      LocationImport(
        format="ios",
        as_of=datetime(2026, 10, 5, 6, tzinfo=UTC),
        range_start=datetime(2026, 9, 1, tzinfo=UTC),
        range_end=datetime(2026, 10, 5, 6, tzinfo=UTC),
        segments=7,
        added=7,
        updated=0,
        removed=0,
        unchanged=0,
        stale=0,
      )
    )

    history = await mcp_call(connect, "get_location_history", {"start": "2026-10-04", "end": "2026-10-04", **STOCKHOLM})

    assert "latitude" not in str(history) and "path" not in history["days"][0]
    [day] = history["days"]
    assert day["date"] == "2026-10-04"
    assert [(s["place"], s["label"], s["saved"], s["inside_another"], s["start"], s["end"], s["duration_secs"]) for s in day["stays"]] == [
      (None, "HOME", False, False, "2026-10-04T00:00:00+02:00", "2026-10-04T08:00:00+02:00", 8 * 3600),
      ("The office", None, True, False, "2026-10-04T08:30:00+02:00", "2026-10-04T12:00:00+02:00", int(3.5 * 3600)),
      (None, None, False, True, "2026-10-04T10:00:00+02:00", "2026-10-04T10:30:00+02:00", 1800),
      ("SATS", None, False, False, "2026-10-04T12:20:00+02:00", "2026-10-04T13:20:00+02:00", 3600),
    ]
    assert day["stays"][3]["address"] == "Sveavägen 1"
    assert [(t["mode"], t["distance_m"], t["duration_secs"], t["start"]) for t in day["trips"]] == [("WALKING", 1500.0, 1200, "2026-10-04T12:00:00+02:00")]
    assert [(p["place"], p["label"], p["days"], p["total_secs"]) for p in history["places"]] == [
      (None, "HOME", 1, 8 * 3600),
      ("The office", None, 1, int(3.5 * 3600)),
      ("SATS", None, 1, 3600),
    ]
    assert history["last_import"] == "2026-10-05T06:00:00Z"
    # A saved place's own name is used rather than asking Google for it.
    assert look_up.call_args.args[0] == {"home-id", "cafe-id", "gym-id"}

    both = await mcp_call(connect, "get_location_history", {"start": "2026-10-03", "end": "2026-10-04", **STOCKHOLM})
    first = both["days"][0]
    assert (first["date"], [(s["start"], s["end"]) for s in first["stays"]]) == ("2026-10-03", [("2026-10-03T22:00:00+02:00", "2026-10-04T00:00:00+02:00")])
    assert [t["mode"] for t in first["trips"]] == ["IN_BUS"]
    assert both["places"][0] == {"place": None, "label": "HOME", "days": 2, "total_secs": 10 * 3600}

    other = await mcp_call(connect, "get_location_history", {"start": "2026-10-03", "end": "2026-10-04", **STOCKHOLM}, token="token-b")
    assert other == {"days": [], "places": [], "last_import": None}

  @pytest.mark.asyncio
  async def test_days_follow_the_local_clock_where_the_user_was(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    # 23:00–23:30 in New York (UTC-4) is already the next day in Stockholm, but belongs to the 4th.
    await save_owned(_visit(datetime(2026, 10, 4, 23), datetime(2026, 10, 4, 23, 30), "bar-id", offset=-240))

    history = await mcp_call(connect, "get_location_history", {"start": "2026-10-04", "end": "2026-10-04", **STOCKHOLM})

    assert [(d["date"], d["stays"][0]["start"]) for d in history["days"]] == [("2026-10-04", "2026-10-04T23:00:00-04:00")]
    assert (await mcp_call(connect, "get_location_history", {"start": "2026-10-05", "end": "2026-10-05", **STOCKHOLM}))["days"] == []

  @pytest.mark.asyncio
  async def test_a_range_over_a_month_is_refused(self, connect: ConnectFixture) -> None:
    message = await mcp_call_error(connect, "get_location_history", {"start": "2026-09-01", "end": "2026-10-04", **STOCKHOLM})
    assert "at most 31 days" in message


class TestStaysAndTripsQuery:
  @pytest.mark.asyncio
  async def test_only_visits_and_trips_on_the_days_without_route_points(self, session: AsyncSession, save_owned: SaveFixture, user: User) -> None:
    await save_owned(_visit(datetime(2026, 10, 4, 8), datetime(2026, 10, 4, 9), "home-id"))
    await save_owned(_segment(LocationSegmentKind.activity, datetime(2026, 10, 4, 9), datetime(2026, 10, 4, 10), activity_type="WALKING"))
    await save_owned(_segment(LocationSegmentKind.path, datetime(2026, 10, 4, 8), datetime(2026, 10, 4, 9), points=[[59.3, 18.0, 1759557600]]))
    await save_owned(_visit(datetime(2026, 10, 3, 20), datetime(2026, 10, 4, 0), "the-day-before"))
    await save_owned(_visit(datetime(2026, 10, 5, 0), datetime(2026, 10, 5, 1), "the-day-after"))

    rows = await LocationSegmentRepository.from_session(session).list_stays_and_trips(user.id, date(2026, 10, 4), date(2026, 10, 4))

    assert sorted((row.kind, row.place_id) for row in rows) == [(LocationSegmentKind.activity, None), (LocationSegmentKind.visit, "home-id")]
