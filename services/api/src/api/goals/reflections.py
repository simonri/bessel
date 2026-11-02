"""Questions at random moments of the user's day, to break autopilot, with what their data showed just before."""

import random
import statistics
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

import structlog

from api.activity.repository import ActivityRepository
from api.activity.service import ActivityService
from api.common.utils import utc_now
from api.healthkit.repository import HealthKitSleepSampleRepository
from api.healthkit.service import healthkit_sleep_service
from api.logging import Logger
from api.models.goal import GoalPlan, Reflection
from api.models.notification import Notification
from api.postgres import AsyncSession

log: Logger = structlog.get_logger()

QUESTIONS = (
  "What are you avoiding right now by doing what you're doing?",
  "If someone filmed the last two hours, what would they conclude you want from your life?",
  "Are you moving toward the life you want or the life you refuse?",
  "What's the most important thing you're pretending isn't important?",
  "What did you do today to protect how you see yourself rather than because you wanted to?",
  "When did you feel most alive today? When did you feel most dead?",
  "Where in your life are you trading aliveness for safety?",
  "What's the smallest version of the person you want to become that you could be in the next hour?",
)
TICK = timedelta(minutes=15)
MIN_GAP = timedelta(minutes=45)
CONTEXT_WINDOW = timedelta(hours=2)
# Without sleep data, these bound the day questions may come in.
DEFAULT_DAY = (time(10), time(21))


@dataclass(frozen=True)
class Window:
  start: datetime
  end: datetime


def waking_window(day_start: datetime, wakes: Sequence[int], onsets: Sequence[int], zone: ZoneInfo) -> Window:
  """Half an hour after the user usually wakes to an hour before they usually fall asleep, from minutes since local
  midnight (onsets after midnight count past 24:00). Without sleep data, 10 to 21."""
  if wakes and onsets:
    start = day_start + timedelta(minutes=statistics.median(wakes) + 30)
    end = day_start + timedelta(minutes=statistics.median(onsets) - 60)
    if end - start >= timedelta(hours=4):
      return Window(start, end)
  return Window(datetime.combine(day_start.date(), DEFAULT_DAY[0], zone), datetime.combine(day_start.date(), DEFAULT_DAY[1], zone))


def should_ask(now: datetime, window: Window, per_day: int, asked: Sequence[datetime], draw: Callable[[], float] = random.random) -> bool:
  """Whether to ask now, at a 15-minute tick: spread so the day's questions likely all come before the window ends,
  at random moments, never within 45 minutes of the last one."""
  if per_day <= 0 or not window.start <= now < window.end:
    return False
  today = [at for at in asked if at >= window.start]
  if len(today) >= per_day or (today and now - max(today) < MIN_GAP):
    return False
  ticks_left = max(1, int((window.end - now) / TICK))
  return draw() < (per_day - len(today)) / ticks_left


def next_question(asked: Sequence[str]) -> str:
  """The question asked longest ago, or never."""
  last_asked = {question: index for index, question in enumerate(asked)}
  return min(QUESTIONS, key=lambda q: last_asked.get(q, -1))


async def _context(session: AsyncSession, user_id: object, now: datetime) -> dict:
  repo = ActivityRepository.from_session(session)
  service = ActivityService()
  start, end = int((now - CONTEXT_WINDOW).timestamp()), int(now.timestamp())
  totals: dict[str, int] = {}
  for source in await repo.get_sources(user_id):  # type: ignore[arg-type]
    for app in (await service.summarize(repo, user_id, source, start, end)).apps:  # type: ignore[arg-type]
      totals[app.app_class] = totals.get(app.app_class, 0) + app.active_secs
  apps = sorted(totals.items(), key=lambda item: -item[1])[:4]
  return {"hours": 2, "apps": [{"app": name, "minutes": round(secs / 60)} for name, secs in apps if secs >= 60]}


def context_line(context: dict) -> str | None:
  apps = context.get("apps") or []
  if not apps:
    return None
  return f"Last {context.get('hours', 2)} hours: " + ", ".join(f"{a['app']} {a['minutes']} min" for a in apps)


async def ask_if_due(
  session: AsyncSession, plan: GoalPlan, zone: ZoneInfo, recent: Sequence[Reflection], draw: Callable[[], float] = random.random
) -> Reflection | None:
  """Asks one question now if this tick is the one; also posts it as a notification."""
  now = utc_now().astimezone(zone)
  day_start = datetime.combine(now.date(), time(0), zone)
  nights = await healthkit_sleep_service.nightly_totals(
    HealthKitSleepSampleRepository.from_session(session),
    plan.user_id,
    int((day_start - timedelta(days=14)).timestamp()),
    int(day_start.timestamp() + 12 * 3600),
    zone,
    0,
  )
  wakes, onsets = [], []
  for night in nights:
    if night.wake_time and night.sleep_onset:
      woke = datetime.fromisoformat(night.wake_time).astimezone(zone)
      slept = datetime.fromisoformat(night.sleep_onset).astimezone(zone)
      wakes.append(woke.hour * 60 + woke.minute)
      # The evening before waking; past midnight runs on past 24:00.
      onsets.append(slept.hour * 60 + slept.minute + (1440 if slept.hour < 12 else 0))
  window = waking_window(day_start, wakes, onsets, zone)
  if not should_ask(now, window, plan.questions_per_day, [r.asked_at for r in recent], draw):
    return None
  question = next_question([r.question for r in sorted(recent, key=lambda r: r.asked_at)])
  context = await _context(session, plan.user_id, now)
  reflection = Reflection(user_id=plan.user_id, question=question, asked_at=now, context=context)
  session.add(reflection)
  session.add(Notification(user_id=plan.user_id, title=question, body=context_line(context), link="/goals", kind="info"))
  await session.flush()
  log.info("goals.reflection_asked", user_id=str(plan.user_id))
  return reflection
