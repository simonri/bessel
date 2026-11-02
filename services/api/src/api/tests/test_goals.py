from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from api.goals.schemas import GoalSchema
from api.goals.scoring import Met, ScoreData, score
from api.models.goal import GoalComparison, GoalMetric, GoalPeriod, GoalSensitivity
from api.patterns.service import Night
from httpx import AsyncClient

STOCKHOLM = ZoneInfo("Europe/Stockholm")
# A Wednesday: the current week began Monday 2 November.
TODAY = date(2026, 11, 4)


def goal(metric: GoalMetric, target: float, **extra: Any) -> GoalSchema:
  return GoalSchema(
    id=uuid4(),
    created_at=datetime.now(UTC),
    modified_at=None,
    title="g",
    metric=metric,
    params=extra.pop("params", {}),
    target=target,
    comparison=extra.pop("comparison", GoalComparison.at_least),
    period=extra.pop("period", GoalPeriod.week),
    deadline=None,
    sensitivity=GoalSensitivity.normal,
    why=None,
    position=0,
  )


def night(evening: date, onset: str, wake: str) -> tuple[date, Night]:
  """A night that began on `evening`: onset that evening or after midnight, waking the next day."""
  hours = int(onset[:2])
  onset_day = evening if hours >= 12 else evening + timedelta(days=1)
  started = datetime.fromisoformat(f"{onset_day}T{onset}").replace(tzinfo=STOCKHOLM)
  woke = datetime.fromisoformat(f"{evening + timedelta(days=1)}T{wake}").replace(tzinfo=STOCKHOLM)
  return evening + timedelta(days=1), Night(wake_date=evening + timedelta(days=1), onset=started, wake=woke, asleep_secs=25000)


class TestScoring:
  def test_a_night_counts_for_the_evening_it_began(self) -> None:
    # Sunday night into Monday belongs to last week, even though you woke this week.
    nights = dict([night(date(2026, 11, 1), "23:50", "08:00"), night(date(2026, 11, 2), "00:20", "08:30"), night(date(2026, 11, 3), "03:40", "12:00")])
    result = score(goal(GoalMetric.sleep_before, 5, params={"time": "00:30"}), ScoreData(today=TODAY, nights=nights))

    assert result.current.value == 1
    assert result.history[-1].value == 1
    assert result.unit == "nights"

  def test_mornings_are_read_from_the_wake_time(self) -> None:
    nights = dict([night(date(2026, 11, 2), "00:20", "07:55"), night(date(2026, 11, 3), "02:00", "09:30")])
    result = score(goal(GoalMetric.wake_before, 5, params={"time": "08:00"}), ScoreData(today=TODAY, nights=nights))
    assert result.current.value == 1

  def test_history_streak_and_the_next_rung(self) -> None:
    weeks = [date(2026, 11, 2) - timedelta(weeks=n) for n in range(1, 9)]
    # Two sessions a week for the last three weeks, none before; the target is three.
    strength = {week + timedelta(days=d) for week in weeks[:3] for d in (0, 2)}
    result = score(goal(GoalMetric.gym_sessions, 3), ScoreData(today=TODAY, strength_days=strength))

    assert [p.value for p in result.history] == [0, 0, 0, 0, 0, 2, 2, 2]
    assert result.streak == 0
    # The best recent week (2) plus one is the target itself: aim for that, no rung.
    assert result.step is None
    # One better than the best of the last four weeks, but never the target itself.
    assert score(goal(GoalMetric.gym_sessions, 5), ScoreData(today=TODAY, strength_days=strength)).step == 3

  def test_no_rung_once_the_target_is_met_two_weeks_running(self) -> None:
    weeks = [date(2026, 11, 2) - timedelta(weeks=n) for n in range(1, 3)]
    strength = {week + timedelta(days=d) for week in weeks for d in (0, 2, 4)}
    result = score(goal(GoalMetric.gym_sessions, 3), ScoreData(today=TODAY, strength_days=strength))
    assert (result.step, result.streak) == (None, 2)

  def test_an_at_most_goal_holds_until_it_is_passed(self) -> None:
    g = goal(GoalMetric.manual, 3, comparison=GoalComparison.at_most)
    under = ScoreData(today=TODAY, checkins={g.id: [(date(2026, 11, 2), 1), (date(2026, 11, 3), 1)]})
    over = ScoreData(today=TODAY, checkins={g.id: [(date(2026, 11, d), 1) for d in (2, 3, 3, 4)]})
    assert score(g, under).current.met is True
    assert score(g, over).current.met is False

  def test_people_met_leave_out_excluded_tags_and_count_days(self) -> None:
    met = [Met(date(2026, 11, 2), frozenset({"Family"})), Met(date(2026, 11, 3), frozenset()), Met(date(2026, 11, 3), frozenset({"work"}))]
    result = score(goal(GoalMetric.people_met, 1, params={"exclude_tags": ["family"]}), ScoreData(today=TODAY, met=met))
    assert result.current.value == 1

  def test_net_worth_is_a_level_in_one_currency(self) -> None:
    data = ScoreData(today=TODAY, net_worth={("company", "SEK"): 300_000_000, ("personal", "SEK"): 50_000_000, ("company", "EUR"): 99})
    company = score(goal(GoalMetric.net_worth, 7_000_000, params={"currency": "sek", "owner": "company"}, period=GoalPeriod.none), data)
    everything = score(goal(GoalMetric.net_worth, 3_000_000, params={"currency": "SEK"}, period=GoalPeriod.none), data)
    assert (company.current.value, company.current.met, company.unit) == (3_000_000, False, "SEK")
    assert (everything.current.value, everything.current.met) == (3_500_000, True)

  def test_monthly_goals_look_back_six_months(self) -> None:
    result = score(goal(GoalMetric.gym_sessions, 12, period=GoalPeriod.month), ScoreData(today=TODAY, strength_days={date(2026, 10, 5)}))
    assert (result.current.start, result.history[-1].start, len(result.history)) == (date(2026, 11, 1), date(2026, 10, 1), 6)
    assert result.history[-1].value == 1

  def test_unmeasured_until_there_is_data(self) -> None:
    assert score(goal(GoalMetric.sleep_before, 5, params={"time": "00:30"}), ScoreData(today=TODAY)).measured is False


class TestGoalEndpoints:
  @pytest.mark.asyncio
  async def test_create_score_and_check_in(self, client: AsyncClient) -> None:
    manual = (await client.post("/v1/goals", json={"title": "Read", "metric": "manual", "target": 3})).json()
    gym = (await client.post("/v1/goals", json={"title": "Gym", "metric": "gym_sessions", "target": 3})).json()
    assert (manual["position"], gym["position"]) == (0, 1)

    assert (await client.post(f"/v1/goals/{manual['id']}/checkins", json={"day": str(date.today())})).status_code == 204
    assert (await client.post(f"/v1/goals/{gym['id']}/checkins", json={"day": str(date.today())})).status_code == 400

    board = (await client.get("/v1/goals/scoreboard")).json()
    by_title = {s["goal"]["title"]: s for s in board["goals"]}
    assert by_title["Read"]["current"]["value"] == 1
    assert by_title["Gym"]["measured"] is False

  @pytest.mark.asyncio
  async def test_a_metric_needs_its_params(self, client: AsyncClient) -> None:
    assert (await client.post("/v1/goals", json={"title": "Sleep", "metric": "sleep_before", "target": 5})).status_code == 422
    assert (await client.post("/v1/goals", json={"title": "Sleep", "metric": "sleep_before", "target": 5, "params": {"time": "25:00"}})).status_code == 422
    assert (await client.post("/v1/goals", json={"title": "Money", "metric": "net_worth", "target": 1, "params": {"currency": "SEK"}})).status_code == 422
    ok = {"title": "Money", "metric": "net_worth", "target": 1, "params": {"currency": "SEK"}, "period": "none"}
    assert (await client.post("/v1/goals", json=ok)).status_code == 201

  @pytest.mark.asyncio
  async def test_private_goals_stay_out_unless_asked_for(self, client: AsyncClient) -> None:
    await client.post("/v1/goals", json={"title": "Mine alone", "metric": "manual", "target": 1, "sensitivity": "private"})
    assert [s["goal"]["title"] for s in (await client.get("/v1/goals/scoreboard", params={"include_private": False})).json()["goals"]] == []
    assert len((await client.get("/v1/goals/scoreboard")).json()["goals"]) == 1

  @pytest.mark.asyncio
  async def test_update_keeps_the_metric_and_delete_removes(self, client: AsyncClient) -> None:
    created = (await client.post("/v1/goals", json={"title": "Sleep", "metric": "sleep_before", "target": 5, "params": {"time": "00:30"}})).json()
    updated = (await client.patch(f"/v1/goals/{created['id']}", json={"target": 4, "params": {"time": "01:00"}})).json()
    assert (updated["target"], updated["params"], updated["metric"]) == (4, {"time": "01:00"}, "sleep_before")
    assert (await client.patch(f"/v1/goals/{created['id']}", json={"params": {}})).status_code == 422

    assert (await client.delete(f"/v1/goals/{created['id']}")).status_code == 204
    assert (await client.get("/v1/goals")).json() == []
