"""How a day's sleep, movement and energy are scored and put into words.

Everything is compared with the person's own usual, never with an ideal, and
the words stay encouraging: the page should feel like a friend's take on the
day, not a report card. These are wellness estimates, not medical measures.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

SLEEP_NEED_SECS = 8 * 3600
# Earlier days needed before a usual is trusted; fewer and it's a guess.
MIN_BASELINE_DAYS = 5
MIN_SLEEP_BASELINE_NIGHTS = 3
# Without step or energy data, a workout this long counts as a full day's movement.
DAILY_WORKOUT_GOAL_MINUTES = 30
BEDTIME_STREAK_WINDOW_MINUTES = 45
# The waking day used to judge "so far" for today.
WAKING_DAY_START_HOUR = 7
WAKING_DAY_HOURS = 15
# Before about 10:00 there's too little of the day to say anything about pace.
EARLY_DAY_FRACTION = 0.2

LEARNING_LABEL = "Getting to know you"


def clamp(value: float, low: float, high: float) -> float:
  return max(low, min(high, value))


def mean(values: Sequence[float]) -> float | None:
  return sum(values) / len(values) if values else None


def minutes_of_day(moment: datetime) -> float:
  return moment.hour * 60 + moment.minute + moment.second / 60


def minutes_apart(a: float, b: float) -> float:
  """Distance between two times of day, going around midnight the short way."""
  diff = abs(a - b) % 1440
  return min(diff, 1440 - diff)


def usual_time_of_day(minutes: Sequence[float]) -> float | None:
  """The average of times of day, so 23:30 and 00:30 average to midnight, not noon."""
  if len(minutes) < MIN_SLEEP_BASELINE_NIGHTS:
    return None
  angles = [m / 1440 * 2 * math.pi for m in minutes]
  x = sum(math.cos(a) for a in angles)
  y = sum(math.sin(a) for a in angles)
  return (math.atan2(y, x) / (2 * math.pi) * 1440) % 1440


def waking_day_fraction(now_local: datetime) -> float:
  """How much of today's waking day has passed, so this morning isn't held to a whole day's usual."""
  elapsed_hours = (minutes_of_day(now_local) / 60) - WAKING_DAY_START_HOUR
  return clamp(elapsed_hours / WAKING_DAY_HOURS, 0.0, 1.0)


def format_duration(secs: float) -> str:
  """'7h 05m' or '45m', the same as the apps."""
  minutes = int(round(secs / 60))
  if minutes >= 60:
    return f"{minutes // 60}h {minutes % 60:02d}m"
  return f"{minutes}m"


# MARK: - Sleep


def sleep_score(
  asleep_secs: int,
  deep_secs: int,
  rem_secs: int,
  core_secs: int,
  onset_minutes: float | None,
  usual_onset_minutes: float | None,
) -> int:
  """Up to 60 for time asleep against an 8 hour need, 20 for going to bed near the
  usual time and 20 for deep and REM sleep making up a healthy share of the night."""
  duration = clamp(asleep_secs / SLEEP_NEED_SECS, 0, 1) * 60

  if onset_minutes is None or usual_onset_minutes is None:
    timing = 15.0
  else:
    off_by = minutes_apart(onset_minutes, usual_onset_minutes)
    timing = 20 * clamp((150 - off_by) / 120, 0, 1)

  staged = deep_secs + rem_secs + core_secs
  if staged == 0 or asleep_secs == 0:
    # Only "asleep" was recorded (an iPhone without a Watch): nothing to judge.
    restorative = 15.0
  else:
    restorative = 20 * clamp(((deep_secs + rem_secs) / asleep_secs) / 0.4, 0, 1)

  return round(clamp(duration + timing + restorative, 0, 100))


def sleep_label(score: int, asleep_secs: int) -> str:
  if score >= 85:
    return "Rested"
  if score >= 70:
    return "Good"
  if score >= 50:
    return "Okay"
  return "Short night" if asleep_secs < 6.5 * 3600 else "Restless"


# MARK: - Move


@dataclass(frozen=True)
class MoveResult:
  score: int | None
  label: str


def move_result(
  active_energy_kcal: float | None,
  usual_active_energy_kcal: float | None,
  steps: int | None,
  usual_steps: float | None,
  workout_minutes: float,
  has_any_metrics: bool,
  day_fraction: float,
) -> MoveResult:
  """Movement against a usual day: active energy when the phone or watch records
  it, else steps, else workouts alone.

  Like activity rings, the score fills up through the day towards a usual full
  day. Only the word looks at the pace, comparing with the usual for this time
  of day, and only once the day is properly underway."""
  ratio: float | None = None
  if active_energy_kcal is not None and usual_active_energy_kcal:
    ratio = active_energy_kcal / usual_active_energy_kcal
  elif steps is not None and usual_steps:
    ratio = steps / usual_steps
  elif not has_any_metrics:
    ratio = workout_minutes / DAILY_WORKOUT_GOAL_MINUTES

  if ratio is None:
    return MoveResult(None, LEARNING_LABEL)

  score = round(clamp(ratio * 80, 0, 100))
  if day_fraction < 1:
    if day_fraction < EARLY_DAY_FRACTION:
      label = "Just starting"
    else:
      pace = ratio / day_fraction
      label = "Ahead of usual" if pace >= 1 else "On track" if pace >= 0.6 else "Warming up"
  else:
    label = "Very active" if ratio >= 1.1 else "Active" if ratio >= 0.8 else "Steady" if ratio >= 0.5 else "Easy day"
  return MoveResult(score, label)


# MARK: - Energy


def energy_score(
  hrv_ms: float | None,
  usual_hrv_ms: float | None,
  resting_heart_rate: float | None,
  usual_resting_heart_rate: float | None,
  sleep: int | None,
) -> int | None:
  """How recovered the body looks: heart rate variability above its usual and a
  resting heart rate below its usual both point to more energy, as does good sleep."""
  has_hrv = hrv_ms is not None and usual_hrv_ms
  has_rhr = resting_heart_rate is not None and usual_resting_heart_rate
  if not has_hrv and not has_rhr:
    return None

  score = 65.0
  if has_hrv:
    score += 50 * (hrv_ms / usual_hrv_ms - 1)  # type: ignore[operator]
  if has_rhr:
    score -= 2.5 * (resting_heart_rate - usual_resting_heart_rate)  # type: ignore[operator]
  if sleep is not None:
    score += 0.25 * (sleep - 70)
  return round(clamp(score, 1, 100))


def energy_label(score: int | None) -> str:
  if score is None:
    return LEARNING_LABEL
  if score >= 80:
    return "Charged"
  if score >= 60:
    return "Good"
  if score >= 40:
    return "Steady"
  return "Take it easy"


# MARK: - Bedtime streak


def bedtime_streak(onsets_newest_first: Sequence[float | None], usual_onset_minutes: float | None) -> int:
  """Nights in a row, newest first, that began close to the usual bedtime."""
  if usual_onset_minutes is None:
    return 0
  streak = 0
  for onset in onsets_newest_first:
    if onset is None or minutes_apart(onset, usual_onset_minutes) > BEDTIME_STREAK_WINDOW_MINUTES:
      break
    streak += 1
  return streak


# MARK: - Insight


@dataclass(frozen=True)
class DayFacts:
  is_today: bool
  asleep_secs: int | None
  usual_asleep_secs: int | None
  energy_label: str | None
  move_label: str | None
  workout_count: int
  workout_minutes: float
  bedtime_streak: int


def insight(facts: DayFacts) -> str:
  """One sentence about the day: advice for today, a recap for days gone by."""
  sleep_diff = None
  if facts.asleep_secs is not None and facts.usual_asleep_secs is not None:
    sleep_diff = facts.asleep_secs - facts.usual_asleep_secs

  if not facts.is_today:
    return _recap(facts, sleep_diff)

  if facts.energy_label == "Take it easy":
    return "Your body could use an easy day. Something gentle sounds perfect 🌿"
  if sleep_diff is not None and sleep_diff <= -45 * 60:
    return f"You slept {format_duration(-sleep_diff)} less than usual. An earlier night tonight would feel good 🌙"
  if sleep_diff is not None and sleep_diff >= 30 * 60:
    return f"You slept {format_duration(sleep_diff)} more than usual. A nice day for something active ✨"
  if facts.bedtime_streak >= 3:
    return f"{facts.bedtime_streak} nights in a row around your usual bedtime. Keep it going 💫"
  if facts.move_label == "Ahead of usual":
    return "You're more active than usual today. Love that 💪"
  if facts.energy_label == "Charged":
    return "You're well recovered. A great day to push a little ⚡️"
  if facts.asleep_secs is None:
    return "No sleep recorded for last night yet 🌙"
  return "A steady day so far. Small things count too 🌸"


def _recap(facts: DayFacts, sleep_diff: int | None) -> str:
  parts: list[str] = []
  if facts.asleep_secs is not None:
    sleep = f"you slept {format_duration(facts.asleep_secs)}"
    if sleep_diff is not None and abs(sleep_diff) >= 20 * 60:
      sleep += f", {format_duration(abs(sleep_diff))} {'more' if sleep_diff > 0 else 'less'} than usual"
    parts.append(sleep)
  if facts.workout_count:
    parts.append(f"worked out for {format_duration(facts.workout_minutes * 60)}")
  elif facts.move_label in ("Very active", "Active"):
    parts.append("had an active day")
  if not parts:
    return "Nothing recorded for this day."
  sentence = " and ".join(parts) + "."
  return sentence[0].upper() + sentence[1:]
