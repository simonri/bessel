from datetime import date
from enum import StrEnum
from typing import Any
from uuid import UUID

from sqlalchemy import Date, Enum, Float, ForeignKey, Integer, String, Text, Uuid
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
