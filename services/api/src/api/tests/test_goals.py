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

  def test_body_goals_read_the_latest_weigh_in_of_their_own_kind(self) -> None:
    body = [(date(2026, 10, 20), 81.0, 18.0), (date(2026, 10, 30), 79.5, None), (date(2026, 11, 3), None, 16.5)]
    weight = score(goal(GoalMetric.body_weight, 77, comparison=GoalComparison.at_most, period=GoalPeriod.none), ScoreData(today=TODAY, body=body))
    fat = score(goal(GoalMetric.body_fat, 17, comparison=GoalComparison.at_most, period=GoalPeriod.none), ScoreData(today=TODAY, body=body))
    assert (weight.current.value, weight.current.met, weight.unit, weight.measured) == (79.5, False, "kg", True)
    assert (fat.current.value, fat.current.met, fat.unit) == (16.5, True, "%")
    unweighed = score(goal(GoalMetric.body_fat, 17, period=GoalPeriod.none), ScoreData(today=TODAY, body=[(date(2026, 11, 3), 79.0, None)]))
    assert unweighed.measured is False

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
  async def test_a_weight_goal_reads_this_months_weigh_ins(self, client: AsyncClient) -> None:
    assert (await client.post("/v1/goals", json={"title": "Weight", "metric": "body_weight", "target": 77})).status_code == 422
    created = await client.post("/v1/goals", json={"title": "Weight", "metric": "body_weight", "target": 77, "comparison": "at_most", "period": "none"})
    assert created.status_code == 201

    recent, old = date.today() - timedelta(days=2), date.today() - timedelta(days=40)
    await client.post("/v1/goals", json={"title": "Fat", "metric": "body_fat", "target": 15, "comparison": "at_most", "period": "none"})
    days = [{"date": str(old), "body_mass_kg": 76.0, "body_fat_pct": 14.0}, {"date": str(recent), "steps": 5000, "body_mass_kg": 78.4}]
    await client.post("/v1/healthkit/daily-metrics/sync", json={"days": days})
    # A build that doesn't read weight sends the same day again without it.
    await client.post("/v1/healthkit/daily-metrics/sync", json={"days": [{"date": str(recent), "steps": 9000}]})

    weight, fat = (await client.get("/v1/goals/scoreboard")).json()["goals"]
    assert (weight["current"]["value"], weight["current"]["met"], weight["unit"]) == (78.4, False, "kg")
    # The only body fat reading is over a month old: it says nothing about now.
    assert fat["measured"] is False

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


class TestTypicalDay:
  def test_reads_the_weekday_from_the_users_data(self) -> None:
    from types import SimpleNamespace

    from api.goals.typical import typical_day
    from api.patterns.service import PatternData

    end = date(2026, 11, 4)
    tuesdays = [date(2026, 10, 27), date(2026, 10, 20)]
    nights = {}
    for day in tuesdays:
      nights.update([night(day - timedelta(days=1), "03:00", "12:00"), night(day, "04:00", "12:30")])

    def at(day: date, clock: str) -> int:
      return int(datetime.fromisoformat(f"{day}T{clock}").replace(tzinfo=STOCKHOLM).timestamp())

    # Computer from 13:00 to 02:00 the next night: the session after midnight belongs to Tuesday.
    periods = [(at(d, "13:00"), at(d, "17:00")) for d in tuesdays] + [(at(d, "22:00"), at(d + timedelta(days=1), "02:00")) for d in tuesdays]
    done = [SimpleNamespace(completed_at=datetime.fromisoformat(f"{tuesdays[0]}T15:00").replace(tzinfo=STOCKHOLM))] * 2
    data = PatternData(
      start=end - timedelta(days=43),
      end=end,
      tz=STOCKHOLM,
      nights=nights,
      steps={tuesdays[0]: 3000, tuesdays[1]: 5000},
      strength_days={tuesdays[0]},
      workouts=[],
      completed=done,
      due=[],
      overdue=0,
      periods=sorted(periods),
      activity_days=set(tuesdays),
    )

    day = typical_day(data, weekday=1, weeks=6)

    assert (day.wake, day.asleep) == ("12:00", "04:00")
    assert (day.computer_from, day.computer_until, day.computer_hours) == ("13:00", "02:00", 8.0)
    assert (day.steps, day.gym_share) == (4000, round(1 / 6, 2))
    assert day.tasks_completed == round(2 / 6, 1)
    assert day.days == 2


class TestGoalPlan:
  @pytest.mark.asyncio
  async def test_saved_in_the_users_words_and_cleared_when_emptied(self, client: AsyncClient) -> None:
    assert (await client.get("/v1/goals/plan")).json()["vision"] is None
    saved = (await client.put("/v1/goals/plan", json={"vision": "  Fri och frisk ", "anti_vision": "Vaken till 04", "rules": "Hälsan först"})).json()
    assert (saved["vision"], saved["anti_vision"]) == ("Fri och frisk", "Vaken till 04")

    cleared = (await client.put("/v1/goals/plan", json={"vision": "", "rules": "Hälsan först"})).json()
    assert (cleared["vision"], cleared["anti_vision"], cleared["rules"]) == (None, None, "Hälsan först")
    assert (await client.get("/v1/goals/plan")).json()["rules"] == "Hälsan först"

  @pytest.mark.asyncio
  async def test_typical_day_answers_with_no_data(self, client: AsyncClient) -> None:
    day = (await client.get("/v1/goals/typical-day", params={"weekday": 1})).json()
    assert (day["days"], day["wake"], day["tasks_completed"]) == (0, None, 0)
    assert (await client.get("/v1/goals/typical-day", params={"weekday": 7})).status_code == 422
