from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from api.bank_accounts.service import accounts_overview
from api.common.utils import utc_now
from api.goals.repository import GoalCheckinRepository, GoalRepository
from api.goals.schemas import GoalSchema, GoalScore, GoalScoreboard
from api.goals.scoring import HISTORY, Met, ScoreData, period_of, score
from api.gym.repository import GymTopSetRepository
from api.healthkit.repository import HealthKitDailyMetricRepository, HealthKitSleepSampleRepository, HealthKitWorkoutRepository
from api.healthkit.service import healthkit_sleep_service
from api.models.goal import Goal, GoalMetric, GoalPeriod, GoalSensitivity
from api.patterns.service import Night
from api.postgres import AsyncSession
from api.projects.repository import ProjectRepository
from api.tasks.repository import TaskRepository
from api.tasks.schemas import TaskStatus

# A weight older than this says nothing about now.
BODY_LOOKBACK_DAYS = 30


def _local(day: date, hour: int, tz: ZoneInfo) -> datetime:
  return datetime.combine(day, time(hour), tzinfo=tz)


def _first_day(goals: Sequence[Goal], today: date) -> date:
  """The earliest day any goal's history reaches back to."""
  first = today
  for goal in goals:
    if goal.period == GoalPeriod.none:
      continue
    start = period_of(today, goal.period)[0]
    for _ in range(HISTORY[goal.period]):
      start = period_of(start - timedelta(days=1), goal.period)[0]
    first = min(first, start)
  return first


class GoalService:
  async def scoreboard(self, session: AsyncSession, user_id: UUID, tz: ZoneInfo, *, include_private: bool) -> GoalScoreboard:
    today = utc_now().astimezone(tz).date()
    goals = [g for g in await GoalRepository.from_session(session).list_for_user(user_id) if include_private or g.sensitivity != GoalSensitivity.private]
    data = await self._load(session, user_id, tz, today, goals)
    return GoalScoreboard(today=today, goals=[self.score(goal, data) for goal in goals])

  def score(self, goal: Goal, data: ScoreData) -> GoalScore:
    return score(GoalSchema.model_validate(goal), data)

  async def _load(self, session: AsyncSession, user_id: UUID, tz: ZoneInfo, today: date, goals: Sequence[Goal]) -> ScoreData:
    """Only what the goals measure, from the first day any of them looks back to."""
    metrics = {g.metric for g in goals}
    first = _first_day(goals, today)
    since, until = _local(first - timedelta(days=1), 0, tz), _local(today + timedelta(days=1), 0, tz)
    data = ScoreData(today=today)

    if metrics & {GoalMetric.sleep_before, GoalMetric.wake_before}:
      entries = await healthkit_sleep_service.nightly_totals(
        HealthKitSleepSampleRepository.from_session(session),
        user_id,
        int(_local(first, 12, tz).timestamp()),
        int(_local(today + timedelta(days=1), 12, tz).timestamp()),
        tz,
        0,
      )
      data.nights = {
        date.fromisoformat(e.date): Night(
          wake_date=date.fromisoformat(e.date),
          onset=datetime.fromisoformat(e.sleep_onset),
          wake=datetime.fromisoformat(e.wake_time),
          asleep_secs=e.asleep_secs,
        )
        for e in entries
        if e.sleep_onset is not None and e.wake_time is not None
      }
    if GoalMetric.gym_sessions in metrics:
      gym_days = {top.performed_on for top, _ in await GymTopSetRepository.from_session(session).list_between(user_id, first, today)}
      workouts = await HealthKitWorkoutRepository.from_session(session).list_started_between(user_id, since, until)
      data.strength_days = gym_days | {w.start_date.astimezone(tz).date() for w in workouts if "strength" in w.workout_activity_type_name.lower()}
    if GoalMetric.tasks_completed in metrics:
      tasks = TaskRepository.from_session(session)
      done = await tasks.get_all(tasks.get_filtered_statement(user_id, statuses=[TaskStatus.done], completed_after=since, completed_before=until))
      data.completed = [(t.completed_at.astimezone(tz).date(), t.project_id) for t in done if t.completed_at is not None]
      data.projects = {p.name.strip().lower(): p.id for p in await ProjectRepository.from_session(session).list_for_user(user_id)}
    checkins = GoalCheckinRepository.from_session(session)
    if GoalMetric.people_met in metrics:
      data.met = [Met(day=day, tags=frozenset(tags)) for day, tags in await checkins.met_since(user_id, first)]
    manual = [g.id for g in goals if g.metric == GoalMetric.manual]
    for checkin in await checkins.list_since(user_id, manual, date.min if any(g.period == GoalPeriod.none for g in goals) else first):
      data.checkins.setdefault(checkin.goal_id, []).append((checkin.day, checkin.value))
    if metrics & {GoalMetric.body_weight, GoalMetric.body_fat}:
      days = await HealthKitDailyMetricRepository.from_session(session).list_between(user_id, today - timedelta(days=BODY_LOOKBACK_DAYS), today)
      data.body = [(m.date, m.body_mass_kg, m.body_fat_pct) for m in days]
    if GoalMetric.net_worth in metrics:
      overview = await accounts_overview.overview(session, user_id, now=utc_now(), zone=tz)
      data.net_worth = {(t.owner, t.currency.upper()): t.net for t in overview.totals}
    return data


goal_service = GoalService()
