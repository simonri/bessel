from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from api.healthkit import scores
from httpx import AsyncClient
from pytest_mock import MockerFixture

STOCKHOLM = ZoneInfo("Europe/Stockholm")
DAY = date(2026, 9, 20)


def _local(day: date, hour: int, minute: int = 0) -> datetime:
  return datetime(day.year, day.month, day.day, hour, minute, tzinfo=STOCKHOLM)


def _sleep_sample(start: datetime, end: datetime, stage: str = "asleepCore") -> dict[str, Any]:
  return {
    "healthkit_uuid": str(uuid4()),
    "sleep_value": 3,
    "sleep_value_name": stage,
    "start_date": start.isoformat(),
    "end_date": end.isoformat(),
    "source_name": "Apple Watch",
    "source_bundle_id": "com.apple.health",
  }


def _night(wake_day: date, bed_hour: int = 23, hours: float = 7.5) -> list[dict[str, Any]]:
  """A night ending on the morning of `wake_day`: core sleep with deep and REM in it."""
  start = _local(wake_day - timedelta(days=1), bed_hour)
  end = start + timedelta(hours=hours)
  deep_end = start + timedelta(hours=1.5)
  rem_start = end - timedelta(hours=1.5)
  return [
    _sleep_sample(start, deep_end, "asleepDeep"),
    _sleep_sample(deep_end, rem_start, "asleepCore"),
    _sleep_sample(rem_start, end, "asleepREM"),
  ]


def _workout(start: datetime, minutes: int) -> dict[str, Any]:
  return {
    "healthkit_uuid": str(uuid4()),
    "workout_activity_type": 37,
    "workout_activity_type_name": "running",
    "start_date": start.isoformat(),
    "end_date": (start + timedelta(minutes=minutes)).isoformat(),
    "duration": minutes * 60,
    "total_energy_burned": 300,
    "total_distance": 5000,
    "source_name": "Apple Watch",
    "source_bundle_id": "com.apple.health",
  }


def _metric(day: date, **values: Any) -> dict[str, Any]:
  return {"date": day.isoformat(), **values}


async def _summary(client: AsyncClient, day: date = DAY) -> dict[str, Any]:
  resp = await client.get("/v1/healthkit/summary", params={"date": day.isoformat(), "tz_name": "Europe/Stockholm"})
  assert resp.status_code == 200, resp.text
  return resp.json()


class TestScores:
  def test_a_full_restful_night_scores_high(self) -> None:
    score = scores.sleep_score(8 * 3600, deep_secs=5400, rem_secs=6300, core_secs=17100, onset_minutes=23 * 60, usual_onset_minutes=23 * 60 + 10)
    assert score >= 95
    assert scores.sleep_label(score, 8 * 3600) == "Rested"

  def test_a_short_night_reads_as_short(self) -> None:
    score = scores.sleep_score(5 * 3600, deep_secs=1800, rem_secs=1800, core_secs=14400, onset_minutes=2 * 60, usual_onset_minutes=23 * 60)
    assert score < 50
    assert scores.sleep_label(score, 5 * 3600) == "Short night"

  def test_bedtimes_average_across_midnight(self) -> None:
    usual = scores.usual_time_of_day([23 * 60 + 30, 30, 0])
    assert usual is not None
    assert scores.minutes_apart(usual, 0) < 1

  def test_this_morning_is_not_held_to_a_whole_days_usual(self) -> None:
    morning = scores.waking_day_fraction(datetime(2026, 9, 20, 10, 0))
    partial = scores.move_result(150, 500, None, None, 0, has_any_metrics=True, day_fraction=morning)
    whole = scores.move_result(150, 500, None, None, 0, has_any_metrics=True, day_fraction=1.0)

    assert partial.label in ("On track", "Ahead of usual")
    assert whole.label == "Easy day"

  def test_says_nothing_about_pace_before_the_day_gets_going(self) -> None:
    night = scores.waking_day_fraction(datetime(2026, 9, 20, 2, 0))
    result = scores.move_result(20, 500, None, None, 0, has_any_metrics=True, day_fraction=night)

    assert result.label == "Just starting"
    assert result.score == 3

  def test_move_waits_for_a_usual(self) -> None:
    assert scores.move_result(300, None, 5000, None, 0, has_any_metrics=True, day_fraction=1.0) == scores.MoveResult(None, scores.LEARNING_LABEL)

  def test_without_any_activity_data_workouts_count(self) -> None:
    assert scores.move_result(None, None, None, None, 30, has_any_metrics=False, day_fraction=1.0).score == 80

  def test_energy_follows_heart_signals(self) -> None:
    recovered = scores.energy_score(hrv_ms=70, usual_hrv_ms=55, resting_heart_rate=52, usual_resting_heart_rate=56, sleep=85)
    strained = scores.energy_score(hrv_ms=40, usual_hrv_ms=55, resting_heart_rate=62, usual_resting_heart_rate=56, sleep=45)

    assert scores.energy_label(recovered) == "Charged"
    assert scores.energy_label(strained) == "Take it easy"
    assert scores.energy_score(70, None, 52, None, 85) is None

  def test_bedtime_streak_stops_at_the_first_late_night(self) -> None:
    usual = 23 * 60
    assert scores.bedtime_streak([23 * 60 + 20, 22 * 60 + 50, 1 * 60 + 30, 23 * 60], usual) == 2

  def test_insight_gives_advice_today_and_a_recap_for_past_days(self) -> None:
    facts = {
      "asleep_secs": 6 * 3600,
      "usual_asleep_secs": 7 * 3600 + 30 * 60,
      "energy_label": None,
      "move_label": None,
      "workout_count": 1,
      "workout_minutes": 32,
      "bedtime_streak": 0,
    }
    today = scores.insight(scores.DayFacts(is_today=True, **facts))
    past = scores.insight(scores.DayFacts(is_today=False, **facts))

    assert today.startswith("You slept 1h 30m less than usual")
    assert past == "You slept 6h 00m, 1h 30m less than usual and worked out for 32m."


class TestDailyMetricsSync:
  @pytest.mark.asyncio
  async def test_a_days_values_are_replaced_not_added(self, client: AsyncClient) -> None:
    await client.post("/v1/healthkit/daily-metrics/sync", json={"days": [_metric(DAY, steps=4000, active_energy_kcal=200)]})
    resp = await client.post("/v1/healthkit/daily-metrics/sync", json={"days": [_metric(DAY, steps=9000, active_energy_kcal=450)]})
    assert resp.json() == {"synced": 1}

    for offset in range(1, 6):
      await client.post("/v1/healthkit/daily-metrics/sync", json={"days": [_metric(DAY - timedelta(days=offset), steps=8000, active_energy_kcal=400)]})
    move = (await _summary(client))["move"]

    assert (move["steps"], move["active_energy_kcal"], move["usual_steps"]) == (9000, 450, 8000)

  @pytest.mark.asyncio
  async def test_rejects_impossible_values(self, client: AsyncClient) -> None:
    resp = await client.post("/v1/healthkit/daily-metrics/sync", json={"days": [_metric(DAY, resting_heart_rate=0)]})
    assert resp.status_code == 422


class TestSummary:
  @pytest.mark.asyncio
  async def test_brings_a_day_together(self, client: AsyncClient) -> None:
    samples = [sample for offset in range(8) for sample in _night(DAY - timedelta(days=offset))]
    await client.post("/v1/healthkit/sleep/sync", json={"samples": samples})
    days = [
      _metric(DAY - timedelta(days=offset), steps=8000, active_energy_kcal=400, exercise_minutes=30, resting_heart_rate=56, hrv_ms=55)
      for offset in range(1, 11)
    ]
    days.append(_metric(DAY, steps=11000, active_energy_kcal=560, exercise_minutes=45, resting_heart_rate=53, hrv_ms=68))
    await client.post("/v1/healthkit/daily-metrics/sync", json={"days": days})
    await client.post("/v1/healthkit/workouts/sync", json={"workouts": [_workout(_local(DAY, 18), 32)]})

    summary = await _summary(client)

    assert summary["is_today"] is False
    assert summary["sleep"]["asleep_secs"] == 7.5 * 3600
    assert (summary["sleep"]["deep_secs"], summary["sleep"]["rem_secs"]) == (5400, 5400)
    assert summary["sleep"]["usual_asleep_secs"] == 7.5 * 3600
    assert summary["sleep"]["label"] == "Rested"
    assert summary["move"]["label"] == "Very active"
    assert summary["move"]["workout_count"] == 1
    assert summary["energy"]["label"] == "Charged"
    assert summary["bedtime_streak"] == 8
    assert [d["date"] for d in summary["week"]] == [(DAY - timedelta(days=offset)).isoformat() for offset in range(6, -1, -1)]
    assert summary["week"][-1]["workout_minutes"] == 32
    assert summary["insight"] == "You slept 7h 30m and worked out for 32m."

  @pytest.mark.asyncio
  async def test_without_a_watch_there_is_no_energy(self, client: AsyncClient) -> None:
    await client.post("/v1/healthkit/daily-metrics/sync", json={"days": [_metric(DAY, steps=6000)]})

    summary = await _summary(client)

    assert summary["energy"] is None
    assert summary["move"]["label"] == scores.LEARNING_LABEL
    assert summary["sleep"] is None

  @pytest.mark.asyncio
  async def test_a_day_without_a_reading_is_not_learning(self, client: AsyncClient) -> None:
    days = [_metric(DAY - timedelta(days=offset), steps=8000, active_energy_kcal=400, resting_heart_rate=56, hrv_ms=55) for offset in range(1, 11)]
    await client.post("/v1/healthkit/daily-metrics/sync", json={"days": days})

    summary = await _summary(client)

    assert (summary["move"]["label"], summary["energy"]["label"]) == ("Not recorded", "Not recorded")
    assert summary["move"]["usual_steps"] == 8000

  @pytest.mark.asyncio
  async def test_an_empty_day(self, client: AsyncClient) -> None:
    summary = await _summary(client)
    assert (summary["sleep"], summary["move"], summary["energy"]) == (None, None, None)
    assert summary["insight"] == "Nothing recorded for this day."

  @pytest.mark.asyncio
  async def test_today_speaks_to_the_day_ahead(self, client: AsyncClient, mocker: MockerFixture) -> None:
    mocker.patch("api.healthkit.endpoints.utc_now", return_value=_local(DAY, 9).astimezone(UTC))
    samples = [sample for offset in range(1, 8) for sample in _night(DAY - timedelta(days=offset))]
    samples += _night(DAY, hours=5.5)
    await client.post("/v1/healthkit/sleep/sync", json={"samples": samples})

    summary = await _summary(client)

    assert summary["is_today"] is True
    assert summary["insight"].startswith("You slept 2h 00m less than usual")

  @pytest.mark.asyncio
  async def test_future_days_are_rejected(self, client: AsyncClient) -> None:
    resp = await client.get("/v1/healthkit/summary", params={"date": (date.today() + timedelta(days=2)).isoformat(), "tz_name": "Europe/Stockholm"})
    assert resp.status_code == 422

  @pytest.mark.asyncio
  async def test_sleep_samples_can_be_listed_for_one_night(self, client: AsyncClient) -> None:
    await client.post("/v1/healthkit/sleep/sync", json={"samples": _night(DAY) + _night(DAY - timedelta(days=3))})

    resp = await client.get(
      "/v1/healthkit/sleep",
      params={"start_ts": int(_local(DAY - timedelta(days=1), 12).timestamp()), "end_ts": int(_local(DAY, 12).timestamp()), "limit": 100},
    )

    assert len(resp.json()["items"]) == 3
