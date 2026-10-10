from datetime import UTC, datetime
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from api.models.time_tracking import TimeEntry
from api.time_tracking.service import month_totals
from httpx import AsyncClient

STOCKHOLM = ZoneInfo("Europe/Stockholm")


async def _project(http: AsyncClient, **overrides: Any) -> dict[str, Any]:
  body = {"name": "Audit", "color": "#4a9ee0", **overrides}
  resp = await http.post("/v1/time/projects", json=body)
  assert resp.status_code == 201, resp.text
  return resp.json()


async def _entry(client: AsyncClient, project_id: str, start: str, end: str, **extra: Any) -> dict[str, Any]:
  resp = await client.post("/v1/time/entries", json={"time_project_id": project_id, "start_ts": start, "end_ts": end, **extra})
  assert resp.status_code == 201, resp.text
  return resp.json()


class TestTimeProjects:
  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_create_list_and_archive(self, client: AsyncClient) -> None:
    project = await _project(client, client="Acme", hourly_rate=1250, currency="SEK")
    assert project["client"] == "Acme"
    assert project["hourly_rate"] == 1250
    assert project["archived_at"] is None

    archived = (await client.patch(f"/v1/time/projects/{project['id']}", json={"archived": True})).json()
    assert archived["archived_at"] is not None

    listed = (await client.get("/v1/time/projects")).json()
    assert [p["id"] for p in listed] == [project["id"]]

    restored = (await client.patch(f"/v1/time/projects/{project['id']}", json={"archived": False})).json()
    assert restored["archived_at"] is None

  @pytest.mark.asyncio
  async def test_rejects_bad_color(self, client: AsyncClient) -> None:
    resp = await client.post("/v1/time/projects", json={"name": "X", "color": "blue"})
    assert resp.status_code == 422


class TestTimeEntries:
  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_create_move_and_delete(self, client: AsyncClient) -> None:
    project = await _project(client)
    entry = await _entry(client, project["id"], "2026-10-06T07:00:00Z", "2026-10-06T09:30:00Z", note="Kickoff")

    moved = await client.patch(f"/v1/time/entries/{entry['id']}", json={"start_ts": "2026-10-06T08:00:00Z", "end_ts": "2026-10-06T10:00:00Z"})
    assert moved.status_code == 200
    assert moved.json()["note"] == "Kickoff"

    week = await client.get("/v1/time/entries", params={"start": "2026-10-05T00:00:00Z", "end": "2026-10-12T00:00:00Z"})
    assert [e["id"] for e in week.json()] == [entry["id"]]

    assert (await client.delete(f"/v1/time/entries/{entry['id']}")).status_code == 204
    after = await client.get("/v1/time/entries", params={"start": "2026-10-05T00:00:00Z", "end": "2026-10-12T00:00:00Z"})
    assert after.json() == []

  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_rejects_backwards_and_overlong_entries(self, client: AsyncClient) -> None:
    project = await _project(client)
    backwards = {"time_project_id": project["id"], "start_ts": "2026-10-06T10:00:00Z", "end_ts": "2026-10-06T09:00:00Z"}
    assert (await client.post("/v1/time/entries", json=backwards)).status_code == 422
    overlong = {"time_project_id": project["id"], "start_ts": "2026-10-06T00:00:00Z", "end_ts": "2026-10-07T01:00:00Z"}
    assert (await client.post("/v1/time/entries", json=overlong)).status_code == 422

  @pytest.mark.asyncio
  async def test_rejects_unknown_project(self, client: AsyncClient) -> None:
    body = {"time_project_id": str(uuid4()), "start_ts": "2026-10-06T07:00:00Z", "end_ts": "2026-10-06T08:00:00Z"}
    assert (await client.post("/v1/time/entries", json=body)).status_code == 404

  @pytest.mark.asyncio
  async def test_rejects_wide_range(self, client: AsyncClient) -> None:
    resp = await client.get("/v1/time/entries", params={"start": "2026-01-01T00:00:00Z", "end": "2026-06-01T00:00:00Z"})
    assert resp.status_code == 422


class TestTimeSummary:
  @pytest.mark.asyncio
  @pytest.mark.keep_session_state
  async def test_totals_per_project_and_month(self, client: AsyncClient) -> None:
    audit = await _project(client)
    other = await _project(client, name="Migration")
    await _entry(client, audit["id"], "2026-10-06T07:00:00Z", "2026-10-06T09:00:00Z")
    await _entry(client, audit["id"], "2026-10-07T07:00:00Z", "2026-10-07T08:30:00Z")
    await _entry(client, other["id"], "2026-09-15T07:00:00Z", "2026-09-15T08:00:00Z")

    resp = await client.get("/v1/time/summary", params={"year": 2026, "tz_name": "Europe/Stockholm"})
    assert resp.status_code == 200
    totals = {(t["time_project_id"], t["month"]): t["seconds"] for t in resp.json()["totals"]}
    assert totals == {(audit["id"], 10): 3.5 * 3600, (other["id"], 9): 3600}

  @pytest.mark.asyncio
  async def test_rejects_unknown_timezone(self, client: AsyncClient) -> None:
    resp = await client.get("/v1/time/summary", params={"year": 2026, "tz_name": "Mars/Base"})
    assert resp.status_code == 422


class TestMonthTotals:
  def test_splits_an_entry_at_local_midnight_between_months(self) -> None:
    project_id = uuid4()
    # 23:00-01:00 Stockholm time across 30 Sep / 1 Oct (UTC+2).
    entry = TimeEntry(time_project_id=project_id, start_ts=datetime(2026, 9, 30, 21, tzinfo=UTC), end_ts=datetime(2026, 9, 30, 23, tzinfo=UTC))
    totals = {(t.month, t.seconds) for t in month_totals([entry], 2026, STOCKHOLM)}
    assert totals == {(9, 3600), (10, 3600)}

  def test_ignores_time_outside_the_year(self) -> None:
    entry = TimeEntry(time_project_id=uuid4(), start_ts=datetime(2025, 12, 31, 22, tzinfo=UTC), end_ts=datetime(2025, 12, 31, 23, 30, tzinfo=UTC))
    totals = month_totals([entry], 2026, STOCKHOLM)
    assert [(t.month, t.seconds) for t in totals] == [(1, 1800)]
