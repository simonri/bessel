import pytest
from api.models.activity_event import ActivityEvent
from api.tests.fixtures.database import SaveFixture
from httpx import AsyncClient

# Day window: 2024-01-15 00:00:00 UTC → 2024-01-16 00:00:00 UTC
DAY_START = 1705276800  # 2024-01-15 00:00:00 UTC
DAY_END = DAY_START + 86400
SOURCE = "test-machine"


def _ev(local_id: int, ts: int, state: str = "active", app_class: str | None = "kitty") -> ActivityEvent:
  return ActivityEvent(
    local_id=local_id,
    ts=ts,
    state=state,
    app_class=app_class,
    title=None,
    workspace=None,
    source=SOURCE,
  )


class TestIntradayActivity:
  @pytest.mark.asyncio
  async def test_empty_day(self, client: AsyncClient) -> None:
    resp = await client.get(
      "/v1/activity/intraday",
      params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["bucket_mins"] == 15
    assert data["total_buckets"] == 96
    assert data["buckets"] == []

  @pytest.mark.asyncio
  async def test_single_active_event(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    # Event at 09:00, next event at 09:05 (300 s gap → capped at 300 s)
    await save_fixture(_ev(1, DAY_START + 9 * 3600))
    await save_fixture(_ev(2, DAY_START + 9 * 3600 + 300, state="idle"))

    resp = await client.get(
      "/v1/activity/intraday",
      params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE},
    )
    assert resp.status_code == 200
    data = resp.json()
    # 09:00 is bucket index 36 (9 * 60 / 15 = 36)
    assert len(data["buckets"]) == 1
    assert data["buckets"][0]["bucket"] == 36
    assert data["buckets"][0]["active_secs"] == 300

  @pytest.mark.asyncio
  async def test_idle_event_excluded(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    await save_fixture(_ev(10, DAY_START + 3600, state="idle"))

    resp = await client.get(
      "/v1/activity/intraday",
      params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE},
    )
    assert resp.status_code == 200
    assert resp.json()["buckets"] == []

  @pytest.mark.asyncio
  async def test_gap_capped_at_600s(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    # Active at 12:00, next event 30 min later — gap capped at 600 s
    await save_fixture(_ev(20, DAY_START + 12 * 3600))
    await save_fixture(_ev(21, DAY_START + 12 * 3600 + 1800, state="idle"))

    resp = await client.get(
      "/v1/activity/intraday",
      params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE},
    )
    assert resp.status_code == 200
    buckets = {b["bucket"]: b["active_secs"] for b in resp.json()["buckets"]}
    # 12:00 → bucket 48; active_secs capped at 600
    assert buckets.get(48) == 600

  @pytest.mark.asyncio
  async def test_custom_bucket_mins(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    await save_fixture(_ev(30, DAY_START + 3600))  # 01:00
    await save_fixture(_ev(31, DAY_START + 3600 + 300, state="idle"))

    resp = await client.get(
      "/v1/activity/intraday",
      params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE, "bucket_mins": 60},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["bucket_mins"] == 60
    assert data["total_buckets"] == 24
    # 01:00 → bucket 1
    assert data["buckets"][0]["bucket"] == 1

  @pytest.mark.asyncio
  async def test_credits_session_carried_over_from_before_window(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    # Active session starts 2 min before the window and continues 3 min into it.
    await save_fixture(_ev(40, DAY_START - 120))
    await save_fixture(_ev(41, DAY_START + 180, state="idle"))

    resp = await client.get(
      "/v1/activity/intraday",
      params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE},
    )
    assert resp.status_code == 200
    buckets = {b["bucket"]: b["active_secs"] for b in resp.json()["buckets"]}
    # Only the portion inside the window (00:00 → 00:03) is credited, to bucket 0.
    assert buckets.get(0) == 180

  @pytest.mark.asyncio
  async def test_leading_event_before_start_of_data_has_no_effect(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    # Leading event is stale (gap to window start exceeds the 600 s cap) — no time bleeds in.
    await save_fixture(_ev(50, DAY_START - 3600))
    await save_fixture(_ev(51, DAY_START + 300))
    await save_fixture(_ev(52, DAY_START + 600, state="idle"))

    resp = await client.get(
      "/v1/activity/intraday",
      params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE},
    )
    assert resp.status_code == 200
    buckets = {b["bucket"]: b["active_secs"] for b in resp.json()["buckets"]}
    # Only event 51's own segment counts (DAY_START+300 → DAY_START+600); the
    # stale leading event contributes nothing.
    assert buckets.get(0) == 300


class TestActivitySummary:
  @pytest.mark.asyncio
  async def test_totals_active_time(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    await save_fixture(_ev(1, DAY_START + 3600, app_class="kitty"))
    await save_fixture(_ev(2, DAY_START + 3600 + 300, app_class="firefox"))
    await save_fixture(_ev(3, DAY_START + 3600 + 600, state="idle"))

    resp = await client.get(
      "/v1/activity/summary",
      params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_active_secs"] == 600
    apps = {a["app_class"]: a["active_secs"] for a in data["apps"]}
    assert apps == {"kitty": 300, "firefox": 300}

  @pytest.mark.asyncio
  async def test_credits_session_carried_over_from_before_window(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    await save_fixture(_ev(10, DAY_START - 120))
    await save_fixture(_ev(11, DAY_START + 180, state="idle"))

    resp = await client.get(
      "/v1/activity/summary",
      params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE},
    )
    assert resp.status_code == 200
    assert resp.json()["total_active_secs"] == 180


class TestDailyActivity:
  @pytest.mark.asyncio
  async def test_splits_session_across_midnight(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    # Active from 23:58 to 00:03 the next day — should split 2 min / 3 min across the boundary.
    await save_fixture(_ev(1, DAY_START + 23 * 3600 + 58 * 60))
    await save_fixture(_ev(2, DAY_START + 24 * 3600 + 3 * 60, state="idle"))

    resp = await client.get(
      "/v1/activity/daily",
      params={"start_ts": DAY_START, "end_ts": DAY_END + 86400, "source": SOURCE, "tz_name": "UTC"},
    )
    assert resp.status_code == 200
    days = {d["date"]: d["active_secs"] for d in resp.json()["days"]}
    assert days["2024-01-15"] == 120
    assert days["2024-01-16"] == 180

  @pytest.mark.asyncio
  async def test_credits_session_carried_over_from_before_range(self, client: AsyncClient, save_fixture: SaveFixture) -> None:
    await save_fixture(_ev(10, DAY_START - 120))
    await save_fixture(_ev(11, DAY_START + 180, state="idle"))

    resp = await client.get(
      "/v1/activity/daily",
      params={"start_ts": DAY_START, "end_ts": DAY_END, "source": SOURCE, "tz_name": "UTC"},
    )
    assert resp.status_code == 200
    days = {d["date"]: d["active_secs"] for d in resp.json()["days"]}
    assert days["2024-01-15"] == 180
