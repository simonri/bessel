from datetime import date, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, Date, Enum, Float, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from .base import RecordModel


class GoalMetric(StrEnum):
  """What a goal is measured by. All but `manual` come from data Bessel already has."""

  # Nights whose sleep started by `time` (HH:MM).
  sleep_before = "sleep_before"
  # Mornings woken by `time` (HH:MM).
  wake_before = "wake_before"
  # Days with a gym session or a strength workout.
  gym_sessions = "gym_sessions"
  # Tasks completed, optionally in one `project`.
  tasks_completed = "tasks_completed"
  # Days met with someone, from the contacts' interaction log, leaving out contacts tagged with any of `exclude_tags`.
  people_met = "people_met"
  # Net worth (cash + investments - debt) in `currency`, for `owner` personal, company or all.
  net_worth = "net_worth"
  # The latest weight (kg) or body fat (%) from Apple Health within the last month: a level, like net worth.
  body_weight = "body_weight"
  body_fat = "body_fat"
  # What the user checks in themselves.
  manual = "manual"


class GoalPeriod(StrEnum):
  week = "week"
  month = "month"
  # A level to reach by the deadline, such as a balance.
  none = "none"


class GoalComparison(StrEnum):
  at_least = "at_least"
  at_most = "at_most"


class GoalSensitivity(StrEnum):
  normal = "normal"
  # Shown only where asked for: a habit the user tracks for themselves alone.
  private = "private"


class Goal(RecordModel):
  """Something the user is working toward, measured each period against a target."""

  __tablename__ = "goals"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  title: Mapped[str] = mapped_column(String(200), nullable=False)
  metric: Mapped[GoalMetric] = mapped_column(Enum(GoalMetric, name="goal_metric"), nullable=False)
  params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
  target: Mapped[float] = mapped_column(Float, nullable=False)
  comparison: Mapped[GoalComparison] = mapped_column(Enum(GoalComparison, name="goal_comparison"), nullable=False, default=GoalComparison.at_least)
  period: Mapped[GoalPeriod] = mapped_column(Enum(GoalPeriod, name="goal_period"), nullable=False, default=GoalPeriod.week)
  deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
  sensitivity: Mapped[GoalSensitivity] = mapped_column(Enum(GoalSensitivity, name="goal_sensitivity"), nullable=False, default=GoalSensitivity.normal)
  why: Mapped[str | None] = mapped_column(Text, nullable=True)
  position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class GoalCheckin(RecordModel):
  """A value the user reported for a manual goal on a day."""

  __tablename__ = "goal_checkins"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  goal_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True)
  day: Mapped[date] = mapped_column(Date, nullable=False)
  value: Mapped[float] = mapped_column(Float, nullable=False, default=1)


class GoalPlan(RecordModel):
  """The user's own words for where they're headed: one per user, written by them, never by an assistant."""

  __tablename__ = "goal_plans"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, unique=True)
  # The life they're building toward.
  vision: Mapped[str | None] = mapped_column(Text, nullable=True)
  # The life they refuse to end up in.
  anti_vision: Mapped[str | None] = mapped_column(Text, nullable=True)
  # "I am the type of person who ..."
  identity: Mapped[str | None] = mapped_column(Text, nullable=True)
  one_year: Mapped[str | None] = mapped_column(Text, nullable=True)
  one_month: Mapped[str | None] = mapped_column(Text, nullable=True)
  # What they won't give up on the way.
  rules: Mapped[str | None] = mapped_column(Text, nullable=True)
  # Questions to ask at random moments of the day, breaking autopilot; 0 is off.
  questions_per_day: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")


class Reflection(RecordModel):
  """A question asked at a random moment of the user's day, with what they were doing then and their answer."""

  __tablename__ = "reflections"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  question: Mapped[str] = mapped_column(String(300), nullable=False)
  asked_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  # What the data showed for the hours before: the apps used and for how long.
  context: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
  answer: Mapped[str | None] = mapped_column(Text, nullable=True)
  answered_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
