from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from api.models.activity_event import ActivityEvent
from api.models.healthkit_sleep_sample import HealthKitSleepSample
from api.models.healthkit_workout import HealthKitWorkout
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error


class TestHealth:
  @pytest.mark.asyncio
  async def test_sleep_is_bucketed_by_wake_date(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    # 23:00 Oct 3 to 07:00 Oct 4, Stockholm (UTC+2).
    await save_owned(
      HealthKitSleepSample(
        healthkit_uuid=uuid4(),
        sleep_value=3,
        sleep_value_name="asleepCore",
        start_date=datetime(2026, 10, 3, 21, tzinfo=UTC),
        end_date=datetime(2026, 10, 4, 5, tzinfo=UTC),
        source_name="Apple Watch",
        source_bundle_id="com.apple.health",
      )
    )

    sleep = await mcp_call(connect, "get_sleep", {"start": "2026-10-04", "end": "2026-10-04", "timezone": "Europe/Stockholm"})
    assert [(n["date"], n["asleep_secs"]) for n in sleep["nights"]] == [("2026-10-04", 8 * 3600)]
    assert sleep["total_asleep_secs"] == 8 * 3600
    assert (await mcp_call(connect, "get_sleep", {"start": "2026-10-03", "end": "2026-10-03", "timezone": "Europe/Stockholm"}))["nights"] == []
    other = await mcp_call(connect, "get_sleep", {"start": "2026-10-04", "end": "2026-10-04", "timezone": "Europe/Stockholm"}, token="token-b")
    assert other == {"nights": [], "total_asleep_secs": 0, "stages": []}

  @pytest.mark.asyncio
  async def test_workouts(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    start = datetime(2026, 10, 4, 7, tzinfo=UTC)
    await save_owned(
      HealthKitWorkout(
        healthkit_uuid=uuid4(),
        workout_activity_type=37,
        workout_activity_type_name="running",
        start_date=start,
        end_date=start + timedelta(minutes=30),
        duration=1800.0,
        total_distance=5000.0,
        source_name="Apple Watch",
        source_bundle_id="com.apple.health",
      )
    )

    workouts = (await mcp_call(connect, "list_workouts"))["workouts"]
    assert [(w["type"], w["duration_secs"], w["distance_m"]) for w in workouts] == [("running", 1800.0, 5000.0)]
    assert (await mcp_call(connect, "list_workouts", token="token-b"))["workouts"] == []


class TestComputerActivity:
  @pytest.mark.asyncio
  async def test_defaults_to_most_recent_source(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    start = int(datetime(2026, 10, 4, 8, tzinfo=UTC).timestamp())
    for i in range(3):
      await save_owned(ActivityEvent(local_id=i, ts=start + i * 60, state="active", app_class="kitty", title=None, workspace=None, source="laptop"))

    summary = await mcp_call(connect, "get_computer_activity", {"start": "2026-10-04", "end": "2026-10-04", "timezone": "UTC"})
    assert summary["source"] == "laptop"
    assert summary["apps"][0]["app_class"] == "kitty"
    assert summary["total_active_secs"] > 0

    args = {"start": "2026-10-04", "end": "2026-10-04", "timezone": "UTC"}
    assert await mcp_call_error(connect, "get_computer_activity", args, token="token-b") == "No computer activity has been recorded."
    theirs = await mcp_call(connect, "get_computer_activity", {**args, "source": "laptop"}, token="token-b")
    assert (theirs["total_active_secs"], theirs["apps"], theirs["sources"]) == (0, [], [])

  @pytest.mark.asyncio
  async def test_no_activity_is_a_tool_error(self, connect: ConnectFixture) -> None:
    args = {"start": "2026-10-04", "end": "2026-10-04", "timezone": "UTC"}
    assert await mcp_call_error(connect, "get_computer_activity", args) == "No computer activity has been recorded."
