from datetime import date
from typing import Annotated, Any, Literal

from pydantic import Field, model_validator

from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.goal import GoalComparison, GoalMetric, GoalPeriod, GoalSensitivity

Clock = Annotated[str, Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$", description="Local time as HH:MM.")]


class GoalParams(Schema):
  """What a metric needs: `time` for sleep_before and wake_before; `project` for tasks_completed; `exclude_tags` for
  people_met; `currency` and `owner` for net_worth."""

  time: Clock | None = None
  project: str | None = Field(default=None, max_length=100)
  exclude_tags: list[Annotated[str, Field(max_length=50)]] = Field(default_factory=list, max_length=10)
  currency: str | None = Field(default=None, min_length=3, max_length=3)
  owner: Literal["personal", "company", "all"] = "all"


_NEEDS: dict[GoalMetric, tuple[str, ...]] = {
  GoalMetric.sleep_before: ("time",),
  GoalMetric.wake_before: ("time",),
  GoalMetric.net_worth: ("currency",),
}


class GoalFields(Schema):
  title: str = Field(min_length=1, max_length=200)
  metric: GoalMetric
  params: GoalParams = Field(default_factory=GoalParams)
  target: float = Field(ge=0, le=1e12)
  comparison: GoalComparison = GoalComparison.at_least
  period: GoalPeriod = GoalPeriod.week
  deadline: date | None = None
  sensitivity: GoalSensitivity = GoalSensitivity.normal
  why: str | None = Field(default=None, max_length=2000)

  @model_validator(mode="after")
  def _fits_the_metric(self) -> "GoalFields":
    missing = [name for name in _NEEDS.get(self.metric, ()) if getattr(self.params, name) is None]
    if missing:
      raise ValueError(f"{self.metric.value} needs params.{', params.'.join(missing)}")
    if self.metric == GoalMetric.net_worth and self.period != GoalPeriod.none:
      raise ValueError("net_worth is a level to reach: use period 'none'")
    return self


class GoalCreate(GoalFields):
  pass


class GoalUpdate(Schema):
  title: str | None = Field(default=None, min_length=1, max_length=200)
  params: GoalParams | None = None
  target: float | None = Field(default=None, ge=0, le=1e12)
  comparison: GoalComparison | None = None
  deadline: date | None = None
  sensitivity: GoalSensitivity | None = None
  why: str | None = Field(default=None, max_length=2000)
  position: int | None = Field(default=None, ge=0, le=10_000)


class GoalSchema(IDSchema, TimestampedSchema):
  title: str
  metric: GoalMetric
  params: dict[str, Any]
  target: float
  comparison: GoalComparison
  period: GoalPeriod
  deadline: date | None
  sensitivity: GoalSensitivity
  why: str | None
  position: int


class GoalCheckinCreate(Schema):
  day: date
  value: float = Field(default=1, ge=0, le=1e9)


class PeriodResult(Schema):
  start: date
  end: date = Field(description="The period's last day.")
  value: float
  met: bool = Field(description="Whether the value reached the target (for the current period: so far).")


class GoalScore(Schema):
  goal: GoalSchema
  unit: str = Field(description="What the value counts, e.g. 'nights', 'sessions', 'SEK'.")
  current: PeriodResult = Field(description="This week or month so far, or the level today for period 'none'.")
  history: list[PeriodResult] = Field(description="The finished periods before it, oldest first.")
  streak: int = Field(description="Finished periods in a row that met the target, up to the current one.")
  step: float | None = Field(description="The rung to aim for now when the target is still far off; None when the target itself is.")
  step_met: bool | None = Field(description="Whether the current period has reached the step so far.")
  measured: bool = Field(description="False when there is no data for this metric yet (e.g. no sleep synced).")


class GoalScoreboard(Schema):
  today: date
  goals: list[GoalScore]


PlanText = Annotated[str | None, Field(default=None, max_length=5000)]


class GoalPlanSchema(Schema):
  vision: PlanText = Field(default=None, description="The life you're building toward.")
  anti_vision: PlanText = Field(default=None, description="The life you refuse to end up in.")
  identity: PlanText = Field(default=None, description="I am the type of person who ...")
  one_year: PlanText = Field(default=None, description="What has to be true in a year.")
  one_month: PlanText = Field(default=None, description="This month's project.")
  rules: PlanText = Field(default=None, description="What you won't give up on the way.")


class TypicalDay(Schema):
  weekday: int = Field(description="0 is Monday.")
  weeks: int = Field(description="How many weeks back it is read from.")
  days: int = Field(description="Days of that weekday with any data.")
  wake: str | None = Field(description="Median time woken, HH:MM.")
  asleep: str | None = Field(description="Median time the night that began that day started, HH:MM.")
  computer_from: str | None = Field(description="Median first use of the computer, HH:MM.")
  computer_until: str | None = Field(description="Median last use, counted into the night after, HH:MM.")
  computer_hours: float | None = Field(description="Median hours at the computer.")
  tasks_completed: float = Field(description="Average tasks completed.")
  gym_share: float = Field(description="Share of those days with a gym session, 0-1.")
  steps: int | None = Field(description="Median steps.")
