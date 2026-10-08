"""Prompts: ready-made conversations the user can start from Claude's prompt menu."""

from collections.abc import Callable
from dataclasses import dataclass
from textwrap import dedent
from typing import Any


@dataclass(frozen=True)
class PromptSpec:
  fn: Callable[..., Any]
  name: str
  title: str
  description: str


def daily_plan() -> str:
  return dedent("""\
    Help me plan my day in Bessel.

    1. Call get_task_overview and get_calendar_events for today.
    2. Give me a short plan: what's fixed in my calendar, then an order for the tasks that fit around it. Lead with \
anything overdue or urgent and the routines due today, and keep it realistic for the free time I have.
    3. Point out anything overdue I should reschedule or drop, and suggest new days.
    4. Ask before changing anything; once I agree, apply it with update_tasks.""")


def weekly_review() -> str:
  return dedent("""\
    Run my weekly review in Bessel.

    1. Call find_completed_tasks for the last 7 days and summarise what I got done, grouped by project.
    2. Call get_task_overview and list what's overdue or has slipped, and what's coming up next week.
    3. For each overdue task, suggest one of: a new day, a lower priority, or cancelling it. Check \
get_calendar_events for next week so new days are realistic.
    4. Ask me which suggestions to apply, then apply them with update_tasks.""")


PROMPTS: list[PromptSpec] = [
  PromptSpec(daily_plan, "daily-plan", "Plan my day", "Plan today from your tasks and calendar."),
  PromptSpec(weekly_review, "weekly-review", "Weekly review", "Review what you finished this week and replan what slipped."),
]
