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

    1. Call get_task_overview and get_calendar_events for today, and get_goal_scoreboard for what I'm working toward.
    2. Pick at most three tasks for today, and make at least one of them move the goal that's furthest behind. Write \
each one's first concrete step. Everything else waits; say so.
    3. Give me a short plan: what's fixed in my calendar, then the three tasks around it, then the routines due today. \
Keep it realistic for the free time I have.
    4. Point out anything overdue I should reschedule or drop, and suggest new days.
    5. Ask before changing anything; once I agree, apply it with update_tasks.""")


def weekly_review() -> str:
  return dedent("""\
    Run my weekly review in Bessel.

    1. Call get_goal_scoreboard. For each goal, say what my data shows this week against the target and the weeks \
before, plainly: what moved, what didn't, and where what I did differs from what I said I want. For a goal far \
off, name the step to aim for next week (its `step`), not the final target. If I wrote down rules for myself \
(get_goal_plan, then search_memory), check the ones my data can show. Set one weekday from get_typical_day beside \
my plan's vision and anti-vision: which of the two is it closer to? If get_reflections has answers from the \
week, name the pattern in them.
    2. Call find_completed_tasks for the last 7 days and summarise what I got done, grouped by project.
    3. Call get_task_overview and list what's overdue or has slipped, and what's coming up next week.
    4. For each overdue task, suggest one of: a new day, a lower priority, or cancelling it. Check \
get_calendar_events for next week so new days are realistic.
    5. Call get_finances_overview and search_transactions for the last 7 days. Mention anything that needs \
attention, such as a bank approval to renew or transactions without a category, and any spending that stands out.
    6. Ask me which suggestions to apply, then apply them with update_tasks.""")


PROMPTS: list[PromptSpec] = [
  PromptSpec(daily_plan, "daily-plan", "Plan my day", "Plan today from your tasks and calendar."),
  PromptSpec(weekly_review, "weekly-review", "Weekly review", "Review what you finished this week and replan what slipped."),
]
