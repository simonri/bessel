from datetime import date
from typing import Literal

from pydantic import Field

from api.common.schemas import Schema


class PatternWindow(Schema):
  start: date = Field(description="First wake date of the window.")
  end: date = Field(description="Last wake date of the window (today).")
  nights: int
  nights_with_sleep: int
  days_with_activity: int = Field(description="Days with any computer activity.")


class WeekdayOnset(Schema):
  night_of: str = Field(description="The evening the night starts on: 'friday' is Friday night, waking on Saturday.")
  median_onset: str = Field(description="Local time, HH:MM.")
  nights: int


class SleepPatterns(Schema):
  median_onset: str | None = Field(description="Local time the main sleep began, HH:MM; a 01:30 onset counts as later than 23:30.")
  median_wake: str | None = Field(description="Local time, HH:MM.")
  onset_iqr_minutes: int | None = Field(description="Spread of onsets: minutes between the earliest and latest quarter.")
  median_asleep_hours: float | None
  by_weekday: list[WeekdayOnset] = Field(description="Monday night first; weekdays without sleep data are left out.")
  recent_median_onset: str | None = Field(description="Median onset over the last 14 nights.")
  earlier_median_onset: str | None = Field(description="Median onset over the nights before those 14.")
  recent_shift_minutes: int | None = Field(description="Recent minus earlier median onset; positive means falling asleep later lately.")


class ComputerOff(Schema):
  median_off: str | None = Field(
    description="Median local time the computer went off for the night: the end of the last period of use that overlaps 18:00-06:00."
  )
  nights: int = Field(description="Nights with computer activity in the evening.")
  median_gap_minutes: int | None = Field(description="Median minutes from computer off to sleep onset, over nights with both.")
  nights_with_both: int
  onset_minutes_per_hour_later: float | None = Field(
    description="Least-squares slope: how many minutes later sleep onset is when the computer goes off an hour later."
  )
  r: float | None = Field(description="Correlation between computer-off time and sleep onset, -1 to 1.")


class Effect(Schema):
  name: str
  description: str = Field(description="The finding in one sentence, with its numbers.")
  n_with: int
  n_without: int
  difference: float = Field(description="With minus without: median minutes of later onset, or average tasks completed.")
  unit: Literal["minutes", "tasks"]
  holds_recently: bool | None = Field(
    description="Whether the last 30 days alone point the same way; null with too few samples there or a window of 30 days or less."
  )


class ProjectOnTime(Schema):
  project: str | None = Field(description="Null for tasks without a project.")
  due: int
  on_time: int
  rate: float


class WeekdayCompletions(Schema):
  weekday: str
  median_completed: float
  days: int


class TaskPatterns(Schema):
  due: int = Field(description="Tasks due in the window, not cancelled; tasks due today count once done.")
  on_time: int = Field(description="Of those, completed on or before their due day.")
  on_time_rate: float | None
  by_project: list[ProjectOnTime] = Field(description="Most tasks due first.")
  completions_by_weekday: list[WeekdayCompletions] = Field(description="Median tasks completed per weekday, counting days with none. Today is left out.")
  overdue: int = Field(description="Open tasks overdue now, as get_task_overview counts them.")


class Patterns(Schema):
  window: PatternWindow
  sleep: SleepPatterns
  computer_off: ComputerOff
  effects: list[Effect] = Field(description="Only effects with at least 5 nights or days on each side.")
  tasks: TaskPatterns
  notes: list[str] = Field(description="Gaps in the data that limit these numbers.")
