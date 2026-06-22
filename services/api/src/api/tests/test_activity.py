import pytest
from httpx import AsyncClient

from api.models.activity_event import ActivityEvent
from api.tests.fixtures.database import SaveFixture

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
