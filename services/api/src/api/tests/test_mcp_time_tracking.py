from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from api.common.utils import utc_now
from api.models.time_tracking import TimeEntry, TimeProject
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error

UTC_ARGS = {"timezone": "UTC"}


def _at(day: int, hour: int) -> datetime:
  return datetime(2026, 10, day, hour, tzinfo=UTC)


class TestGetTimeTracking:
  @pytest.mark.asyncio
  async def test_totals_per_project_cut_to_the_range_and_entries(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    acme = TimeProject(name="Acme site", client="Acme", color="#ff0000", hourly_rate=Decimal("1000.00"), currency="SEK")
    old = TimeProject(name="Old gig", color="#00ff00", archived_at=utc_now())
    await save_owned(acme)
    await save_owned(old)
    # 22:00 on the 4th to 02:00 on the 5th: only the two hours after midnight count.
    await save_owned(TimeEntry(time_project_id=acme.id, start_ts=_at(4, 22), end_ts=_at(5, 2), note="Deploy"))
    await save_owned(TimeEntry(time_project_id=acme.id, start_ts=_at(5, 9), end_ts=_at(5, 12)))
    await save_owned(TimeEntry(time_project_id=old.id, start_ts=_at(6, 13), end_ts=_at(6, 13) + timedelta(minutes=30)))
    await save_owned(TimeEntry(time_project_id=acme.id, start_ts=_at(6, 8), end_ts=_at(6, 9), deleted_at=utc_now()))
    await save_owned(TimeEntry(time_project_id=acme.id, start_ts=_at(8, 8), end_ts=_at(8, 9)))

    logged = await mcp_call(connect, "get_time_tracking", {"start": "2026-10-05", "end": "2026-10-06", **UTC_ARGS})

    assert logged["total_secs"] == 5 * 3600 + 1800
    assert logged["projects"] == [
      {
        "project": "Acme site",
        "client": "Acme",
        "archived": False,
        "total_secs": 5 * 3600,
        "hourly_rate": 1000.0,
        "currency": "SEK",
        "earned": 5000.0,
      },
      {"project": "Old gig", "client": None, "archived": True, "total_secs": 1800, "hourly_rate": None, "currency": None, "earned": None},
    ]
    assert [(e["project"], e["start"], e["duration_secs"], e["note"]) for e in logged["entries"]] == [
      ("Acme site", "2026-10-04T22:00:00Z", 4 * 3600, "Deploy"),
      ("Acme site", "2026-10-05T09:00:00Z", 3 * 3600, None),
      ("Old gig", "2026-10-06T13:00:00Z", 1800, None),
    ]

    other = await mcp_call(connect, "get_time_tracking", {"start": "2026-10-01", "end": "2026-10-31", **UTC_ARGS}, token="token-b")
    assert other == {"total_secs": 0, "projects": [], "entries": []}

  @pytest.mark.asyncio
  async def test_entries_are_shown_in_the_users_timezone(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    project = TimeProject(name="Acme site", color="#ff0000")
    await save_owned(project)
    # 23:30 UTC on the 4th is 01:30 on the 5th in Stockholm.
    await save_owned(TimeEntry(time_project_id=project.id, start_ts=_at(4, 23) + timedelta(minutes=30), end_ts=_at(5, 0) + timedelta(minutes=30)))

    stockholm = await mcp_call(connect, "get_time_tracking", {"start": "2026-10-05", "end": "2026-10-05", "timezone": "Europe/Stockholm"})
    assert [e["start"] for e in stockholm["entries"]] == ["2026-10-05T01:30:00+02:00"]
    assert (await mcp_call(connect, "get_time_tracking", {"start": "2026-10-05", "end": "2026-10-05", **UTC_ARGS}))["total_secs"] == 1800
    assert (await mcp_call(connect, "get_time_tracking", {"start": "2026-10-04", "end": "2026-10-04", "timezone": "Europe/Stockholm"}))["entries"] == []

  @pytest.mark.asyncio
  async def test_a_range_over_two_months_is_refused(self, connect: ConnectFixture) -> None:
    message = await mcp_call_error(connect, "get_time_tracking", {"start": "2026-08-01", "end": "2026-10-04", **UTC_ARGS})
    assert "at most 61 days" in message
