from collections.abc import Callable, Coroutine
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from itertools import count
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
import pytest_asyncio
from api.models.activity_event import ActivityEvent
from api.models.gym import GymExercise, GymTopSet
from api.models.healthkit_daily_metric import HealthKitDailyMetric
from api.models.healthkit_sleep_sample import HealthKitSleepSample
from api.models.healthkit_workout import HealthKitWorkout
from api.models.project import Project
from api.models.task import Task
from api.patterns.service import clock_minutes, format_clock
from api.tests.fixtures.database import SaveFixture
from api.tests.fixtures.mcp import ConnectFixture, mcp_call, mcp_call_error
from pytest_mock import MockerFixture

TZ = ZoneInfo("Europe/Stockholm")
# A Tuesday, before the end of summer time so every local time here is UTC+2.
TODAY = date(2026, 10, 20)

Seed = Callable[..., Coroutine[None, None, None]]


def at(day: date, clock: str) -> datetime:
  return datetime.combine(day, time.fromisoformat(clock), tzinfo=TZ)


def onset_at(wake: date, clock: str) -> datetime:
  """The local moment sleep began for the night ending on `wake`: evening clocks fall on the day before."""
  return at(wake - timedelta(days=1) if time.fromisoformat(clock).hour >= 12 else wake, clock)


async def patterns(connect: ConnectFixture, days: int, *, token: str = "token-a") -> dict[str, Any]:
  return await mcp_call(connect, "get_patterns", {"days": days, "timezone": "Europe/Stockholm"}, token=token)


@pytest.fixture(autouse=True)
def frozen_today(mocker: MockerFixture) -> None:
  mocker.patch("api.mcp.tools.patterns.today_in", return_value=TODAY)


@pytest_asyncio.fixture
async def sleep(save_owned: SaveFixture) -> Seed:
  async def _sleep(wake: date, clock: str, hours: float = 8.0) -> None:
    start = onset_at(wake, clock)
    await save_owned(
      HealthKitSleepSample(
        healthkit_uuid=uuid4(),
        sleep_value=3,
        sleep_value_name="asleepCore",
        start_date=start,
        end_date=start + timedelta(hours=hours),
        source_name="Apple Watch",
        source_bundle_id="com.apple.health",
      )
    )

  return _sleep


@pytest_asyncio.fixture
async def computer_use(save_owned: SaveFixture) -> Seed:
  local_ids = count()

  async def _use(start: datetime, end: datetime) -> None:
    """Active heartbeats every 5 minutes from `start`, and the computer going idle at `end`."""
    ts = int(start.timestamp())
    while ts < int(end.timestamp()):
      await save_owned(ActivityEvent(local_id=next(local_ids), ts=ts, state="active", app_class="kitty", title=None, workspace=None, source="laptop"))
      ts += 300
    await save_owned(
      ActivityEvent(local_id=next(local_ids), ts=int(end.timestamp()), state="idle", app_class=None, title=None, workspace=None, source="laptop")
    )

  return _use


@pytest_asyncio.fixture
async def gym_day(save_owned: SaveFixture) -> Seed:
  exercise = GymExercise(name="Bänkpress", muscles=["chest"])
  await save_owned(exercise)

  async def _gym(day: date) -> None:
    await save_owned(GymTopSet(exercise_id=exercise.id, performed_on=day, weight_kg=Decimal("80")))

  return _gym


@pytest_asyncio.fixture
async def workout(save_owned: SaveFixture) -> Seed:
  async def _workout(end: datetime, type_name: str = "running") -> None:
    await save_owned(
      HealthKitWorkout(
        healthkit_uuid=uuid4(),
        workout_activity_type=37,
        workout_activity_type_name=type_name,
        start_date=end - timedelta(minutes=45),
        end_date=end,
        duration=2700.0,
        source_name="Apple Watch",
        source_bundle_id="com.apple.health",
      )
    )

  return _workout


@pytest_asyncio.fixture
async def completed_task(save_owned: SaveFixture) -> Seed:
  async def _task(completed_at: datetime, **fields: Any) -> None:
    await save_owned(Task(title="Done", status="done", priority=0, position=0, completed_at=completed_at, **fields))

  return _task


def effect(result: dict[str, Any], name: str) -> dict[str, Any] | None:
  return next((e for e in result["effects"] if e["name"] == name), None)


class TestSleep:
  @pytest.mark.asyncio
  async def test_medians_run_across_midnight_and_weekdays_are_keyed_by_the_evening(self, connect: ConnectFixture, sleep: Seed) -> None:
    # Wake dates Wed 14 to Sun 18 Oct and Sat 10 Oct; Saturday wakes are Friday nights.
    for wake, clock in [(14, "23:00"), (15, "23:30"), (17, "00:30"), (18, "01:00"), (10, "02:30")]:
      await sleep(date(2026, 10, wake), clock)

    result = await patterns(connect, 14)

    # Plain clock minutes would make 02:30 the median of these.
    assert result["sleep"]["median_onset"] == "00:30"
    assert result["sleep"]["median_wake"] == "08:30"
    assert result["sleep"]["onset_iqr_minutes"] == 90
    assert result["sleep"]["median_asleep_hours"] == 8.0
    assert result["sleep"]["by_weekday"] == [
      {"night_of": "tuesday", "median_onset": "23:00", "nights": 1},
      {"night_of": "wednesday", "median_onset": "23:30", "nights": 1},
      {"night_of": "friday", "median_onset": "01:30", "nights": 2},
      {"night_of": "saturday", "median_onset": "01:00", "nights": 1},
    ]
    assert result["window"] == {"start": "2026-10-07", "end": "2026-10-20", "nights": 14, "nights_with_sleep": 5, "days_with_activity": 0}
    assert "Sleep missing 9 of 14 nights." in result["notes"]

  @pytest.mark.asyncio
  async def test_the_last_fourteen_nights_are_compared_with_the_ones_before_and_wake_runs_across_noon(self, connect: ConnectFixture, sleep: Seed) -> None:
    for i in range(5):
      await sleep(date(2026, 10, 1) + timedelta(days=i), "23:30", hours=12)
      await sleep(TODAY - timedelta(days=i), "01:30", hours=11)

    result = (await patterns(connect, 30))["sleep"]

    assert (result["earlier_median_onset"], result["recent_median_onset"], result["recent_shift_minutes"]) == ("23:30", "01:30", 120)
    # Waking at 11:30 and 12:30 is a median of noon, not midnight.
    assert result["median_wake"] == "12:00"


class TestComputerOff:
  @pytest.mark.asyncio
  async def test_onset_follows_the_computer_going_off(self, connect: ConnectFixture, sleep: Seed, computer_use: Seed) -> None:
    # Off 23:00 to 01:30, half an hour apart; onset is 30 min after 23:00 plus 1.5x as much again.
    for i in range(6):
      wake = date(2026, 10, 10 + i)
      off = at(wake - timedelta(days=1), "23:00") + timedelta(minutes=30 * i)
      await computer_use(at(wake - timedelta(days=1), "14:00"), at(wake - timedelta(days=1), "15:00"))
      await computer_use(off - timedelta(minutes=40), off)
      await computer_use(at(wake, "10:00"), at(wake, "10:30"))
      onset = at(wake - timedelta(days=1), "23:30") + timedelta(minutes=45 * i)
      await sleep(wake, onset.strftime("%H:%M"))

    result = await patterns(connect, 14)

    assert result["computer_off"] == {
      "median_off": "00:15",
      "nights": 6,
      "median_gap_minutes": 68,
      "nights_with_both": 6,
      "onset_minutes_per_hour_later": 90.0,
      "r": 1.0,
    }
    assert result["window"]["days_with_activity"] == 7
    assert "Computer-off time known for 6 of 14 nights." in result["notes"]


class TestEffects:
  @pytest.mark.asyncio
  async def test_a_gym_effect_needs_five_nights_a_side_and_is_checked_against_the_last_month(
    self, connect: ConnectFixture, sleep: Seed, gym_day: Seed, workout: Seed
  ) -> None:
    recent = TODAY - timedelta(days=29)
    earlier = recent - timedelta(days=20)
    # Earlier, gym nights run 2 h late; in the last 30 days they're an hour early.
    for i in range(5):
      await sleep(earlier + timedelta(days=i), "00:00")
      await sleep(recent + timedelta(days=i), "01:00")
      await sleep(recent + timedelta(days=10 + i), "00:00")
    for i in range(4):
      await sleep(earlier + timedelta(days=10 + i), "02:00")
      await gym_day(earlier + timedelta(days=9 + i))

    too_few = await patterns(connect, 60)
    assert effect(too_few, "gym_day") is None
    assert "Not enough data for gym_day (4 vs 15; needs 5 each)." in too_few["notes"]

    await sleep(earlier + timedelta(days=14), "02:00")
    await workout(at(earlier + timedelta(days=13), "08:00"), "traditionalStrengthTraining")
    for i in range(5):
      await gym_day(recent + timedelta(days=9 + i))

    result = await patterns(connect, 60)

    # Gym nights: five at 02:00, five at 00:00 -> 01:00; other nights: five each at 00:00 and 01:00 -> 00:30.
    assert effect(result, "gym_day") == {
      "name": "gym_day",
      "description": "After a gym or strength-training day, sleep onset was 30 min later than after other days (median 01:00 vs 00:30, 10 vs 10 nights).",
      "n_with": 10,
      "n_without": 10,
      "difference": 30.0,
      "unit": "minutes",
      "holds_recently": False,
    }

  @pytest.mark.asyncio
  async def test_six_thousand_steps_counts_as_a_high_step_day(self, connect: ConnectFixture, sleep: Seed, save_owned: SaveFixture) -> None:
    # Ten nights in the last 30 days and ten before them, the same way round.
    for i in [*range(10), *range(40, 50)]:
      wake = TODAY - timedelta(days=i)
      await save_owned(HealthKitDailyMetric(date=wake - timedelta(days=1), steps=6000 if i % 2 else 5999))
      await sleep(wake, "00:00" if i % 2 else "01:00")

    found = effect(await patterns(connect, 60), "steps_6000")

    assert found is not None
    assert (found["n_with"], found["n_without"], found["difference"], found["holds_recently"]) == (10, 10, -60.0, True)
    assert found["description"].startswith("After days with 6000+ steps, sleep onset was 60 min earlier than after days under 6000")

  @pytest.mark.asyncio
  async def test_a_workout_counts_only_when_it_ended_within_three_hours_of_sleep(self, connect: ConnectFixture, sleep: Seed, workout: Seed) -> None:
    for i in range(10):
      wake = TODAY - timedelta(days=i)
      near = i % 2 == 0
      await sleep(wake, "01:00" if near else "00:00")
      await workout(at(wake - timedelta(days=1), "22:30") if near else at(wake - timedelta(days=1), "20:30"))

    found = effect(await patterns(connect, 14), "workout_within_3h_of_sleep")

    assert found is not None
    assert (found["n_with"], found["n_without"], found["difference"]) == (5, 5, 60.0)

  @pytest.mark.asyncio
  async def test_a_task_completed_after_eleven_marks_a_late_night(self, connect: ConnectFixture, sleep: Seed, completed_task: Seed) -> None:
    for i in range(10):
      wake = TODAY - timedelta(days=i)
      late = i % 2 == 0
      await sleep(wake, "01:30" if late else "00:30")
      await completed_task(at(wake - timedelta(days=1), "23:15") if late else at(wake - timedelta(days=1), "22:45"))

    found = effect(await patterns(connect, 14), "late_task_completion")

    assert found is not None
    assert (found["n_with"], found["n_without"], found["difference"]) == (5, 5, 60.0)

  @pytest.mark.asyncio
  async def test_a_short_night_against_tasks_done_the_next_day_counts_days_with_none(self, connect: ConnectFixture, sleep: Seed, completed_task: Seed) -> None:
    for i in range(1, 11):
      wake = TODAY - timedelta(days=i)
      short = i % 2 == 0
      await sleep(wake, "03:00", hours=5.0 if short else 8.0)
      for _ in range(3 if short else 0):
        await completed_task(at(wake, "14:00"))
    await completed_task(at(TODAY - timedelta(days=1), "15:00"))
    # Today is still going: neither last night nor today's tasks count.
    await sleep(TODAY, "03:00", hours=5.0)
    await completed_task(at(TODAY, "09:00"))

    found = effect(await patterns(connect, 14), "short_night_next_day_tasks")

    assert found == {
      "name": "short_night_next_day_tasks",
      "description": "After a night under 6 h asleep, 3.0 tasks were completed on average vs 0.2 after longer nights (5 vs 5 days).",
      "n_with": 5,
      "n_without": 5,
      "difference": 2.8,
      "unit": "tasks",
      "holds_recently": None,
    }


class TestTasks:
  @pytest.mark.asyncio
  async def test_on_time_rate_per_project_and_completions_per_weekday(self, connect: ConnectFixture, save_owned: SaveFixture) -> None:
    bessel = Project(name="Bessel")
    await save_owned(bessel)

    async def task(due: date | None, status: str = "todo", completed_at: datetime | None = None, **fields: Any) -> None:
      await save_owned(Task(title="T", status=status, priority=0, position=0, due_date=due, completed_at=completed_at, **fields))

    await task(date(2026, 10, 10), "done", at(date(2026, 10, 9), "12:00"), project_id=bessel.id)
    await task(date(2026, 10, 12), "done", at(date(2026, 10, 14), "12:00"), project_id=bessel.id)
    await task(date(2026, 10, 15), project_id=bessel.id)
    # 00:30 local on the 19th is still the 18th in UTC: late.
    await task(date(2026, 10, 18), "done", at(date(2026, 10, 19), "00:30"))
    await task(TODAY, "done", at(TODAY, "09:00"))
    await task(TODAY)
    await task(date(2026, 10, 11), "cancelled")
    await task(date(2026, 9, 30), "done", at(date(2026, 9, 30), "12:00"))
    await task(date(2026, 10, 1), "in_progress")
    await task(date(2026, 10, 1), is_recurring=True, rrule_frequency="daily")

    result = (await patterns(connect, 14))["tasks"]

    assert (result["due"], result["on_time"], result["on_time_rate"], result["overdue"]) == (5, 2, 0.4, 1)
    assert result["by_project"] == [
      {"project": "Bessel", "due": 3, "on_time": 1, "rate": 0.33},
      {"project": None, "due": 2, "on_time": 1, "rate": 0.5},
    ]
    # 7-19 Oct: completions on Fri 9, Wed 14 and Mon 19; today is left out.
    assert result["completions_by_weekday"] == [
      {"weekday": "monday", "median_completed": 0.5, "days": 2},
      {"weekday": "tuesday", "median_completed": 0, "days": 1},
      {"weekday": "wednesday", "median_completed": 0.5, "days": 2},
      {"weekday": "thursday", "median_completed": 0, "days": 2},
      {"weekday": "friday", "median_completed": 0.5, "days": 2},
      {"weekday": "saturday", "median_completed": 0, "days": 2},
      {"weekday": "sunday", "median_completed": 0, "days": 2},
    ]


class TestPatterns:
  @pytest.mark.asyncio
  async def test_no_data_is_an_empty_answer_with_notes(self, connect: ConnectFixture) -> None:
    result = await patterns(connect, 14)

    assert result["effects"] == []
    assert result["sleep"]["median_onset"] is None
    assert result["computer_off"]["nights"] == 0
    assert result["notes"] == [
      "No sleep recorded in the window.",
      "No evening computer activity recorded in the window.",
      "Steps missing for 14 of 14 days.",
      "No gym logs or strength workouts in the window.",
    ]

  @pytest.mark.asyncio
  async def test_the_window_is_two_weeks_to_a_year(self, connect: ConnectFixture) -> None:
    assert "greater than or equal to 14" in await mcp_call_error(connect, "get_patterns", {"days": 13, "timezone": "UTC"})
    assert "less than or equal to 365" in await mcp_call_error(connect, "get_patterns", {"days": 366, "timezone": "UTC"})

  @pytest.mark.asyncio
  async def test_only_the_users_own_data(self, connect: ConnectFixture, sleep: Seed, computer_use: Seed, completed_task: Seed, save_owned: SaveFixture) -> None:
    for i in range(10):
      wake = TODAY - timedelta(days=i)
      await sleep(wake, "01:00")
      await completed_task(at(wake, "12:00"), due_date=wake)
      await save_owned(HealthKitDailyMetric(date=wake, steps=8000))
    for i in range(14):
      evening = TODAY - timedelta(days=i + 1)
      await computer_use(at(evening, "23:00"), at(evening, "23:30"))

    mine = await patterns(connect, 14)
    assert mine["window"]["nights_with_sleep"] == 10
    assert mine["tasks"]["due"] == 10
    assert mine["computer_off"]["nights"] == 14
    # The evening before the window's first night is fetched but isn't a day of the window.
    assert mine["window"]["days_with_activity"] == 13
    # Steps count for the evening before each night: 11-20 Oct cover the nights ending 12-20 Oct.
    assert "Steps missing for 5 of 14 days." in mine["notes"]

    theirs = await patterns(connect, 14, token="token-b")
    assert theirs["window"] == {"start": "2026-10-07", "end": "2026-10-20", "nights": 14, "nights_with_sleep": 0, "days_with_activity": 0}
    assert theirs["computer_off"]["nights"] == 0
    assert (theirs["tasks"]["due"], theirs["tasks"]["completions_by_weekday"][0]["median_completed"]) == (0, 0)
    assert "Steps missing for 14 of 14 days." in theirs["notes"]


def test_clock_helpers_round_trip_past_midnight() -> None:
  assert clock_minutes(datetime(2026, 10, 1, 0, 30, tzinfo=UTC)) > clock_minutes(datetime(2026, 9, 30, 23, 30, tzinfo=UTC))
  assert format_clock(clock_minutes(datetime(2026, 10, 1, 4, 5, tzinfo=UTC))) == "04:05"
