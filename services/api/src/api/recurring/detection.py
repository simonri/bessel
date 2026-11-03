"""Finds money that comes and goes on a schedule: bills, subscriptions and income, from the transactions alone.

Transactions group by what the user calls them (or the bank's text without its reference numbers), direction,
currency and owner. A group whose days follow a weekly, monthly, quarterly or yearly rhythm is one series; one
that doesn't is split by amount, for two plans from one shop. Detection reruns on every read, so a new charge,
a price rise or a missed payment shows at once.
"""

import re
from collections import Counter, defaultdict
from collections.abc import Iterator, Sequence
from dataclasses import dataclass, replace
from datetime import date, timedelta
from enum import StrEnum
from statistics import median
from uuid import UUID

from dateutil.relativedelta import relativedelta

from api.models.recurring_series import RecurringKind
from api.models.transaction import TransactionDirection
from api.transactions.repository import RecurringRow


class Cadence(StrEnum):
  weekly = "weekly"
  monthly = "monthly"
  quarterly = "quarterly"
  yearly = "yearly"


@dataclass(frozen=True)
class _Rhythm:
  days: int
  # The gaps between two payments that still count as on time, allowing for weekends and short months.
  low: int
  high: int
  # Fewer payments than this could be chance.
  min_count: int
  months: int
  # How many fall in an average month, for monthly totals.
  per_month: float
  # Days past the expected one before a payment counts as late.
  grace: int


RHYTHMS: dict[Cadence, _Rhythm] = {
  Cadence.weekly: _Rhythm(days=7, low=5, high=9, min_count=4, months=0, per_month=52 / 12, grace=2),
  Cadence.monthly: _Rhythm(days=30, low=25, high=36, min_count=3, months=1, per_month=1, grace=4),
  Cadence.quarterly: _Rhythm(days=91, low=80, high=102, min_count=3, months=3, per_month=1 / 3, grace=7),
  Cadence.yearly: _Rhythm(days=365, low=350, high=380, min_count=2, months=12, per_month=1 / 12, grace=14),
}

# Amounts this close (as a share of the larger) are one price; a cluster breaks where sorted amounts jump by more.
SAME_PRICE = 0.02
SAME_CLUSTER = 0.25
# A weekly rhythm with changing amounts is more likely a habit, such as Saturday's food shop, than a bill.
WEEKLY_SPREAD = 0.05
# Beyond the first, at most this share of the gaps may be a payment that didn't come (twice the usual gap).
MAX_SKIPPED = 0.2
# Long enough to see a yearly payment twice.
HISTORY = timedelta(days=800)

SUBSCRIPTION_NAMES = (
  "adobe",
  "amazon prime",
  "anthropic",
  "apple.com",
  "audible",
  "bookbeat",
  "c more",
  "chatgpt",
  "claude",
  "discovery",
  "disney",
  "dropbox",
  "github",
  "google one",
  "google storage",
  "hbo",
  "icloud",
  "linkedin",
  "max",
  "microsoft",
  "netflix",
  "nextory",
  "nordvpn",
  "openai",
  "patreon",
  "playstation",
  "skyshowtime",
  "spotify",
  "storytel",
  "tidal",
  "tv4",
  "viaplay",
  "xbox",
  "youtube",
)
_SUBSCRIPTION = re.compile(rf"(?<!\w)({'|'.join(re.escape(n) for n in SUBSCRIPTION_NAMES)})(?!\w)")
# Reference numbers, dates and card digits that change from one charge to the next.
_VARYING = re.compile(r"\S*\d\S*")


class Status(StrEnum):
  active = "active"
  # The expected payment hasn't come yet.
  late = "late"
  # Two or more expected payments haven't come.
  ended = "ended"


@dataclass(frozen=True)
class PriceChange:
  day: date
  old_amount: int
  new_amount: int


@dataclass(frozen=True)
class Series:
  key: str
  name: str
  kind: RecurringKind
  cadence: Cadence
  currency: str
  direction: TransactionDirection
  business: bool
  bank_account_id: UUID
  logo_url: str | None
  # The latest price when it's fixed, or the middle of recent amounts when it varies.
  typical_amount: int
  variable: bool
  count: int
  first_date: date
  last_date: date
  last_amount: int
  status: Status
  # The next payment expected, even if that day has passed (when `late`); none once it has ended.
  next_date: date | None
  price_changes: tuple[PriceChange, ...]
  # The day of the month (or, for weekly, of the week) it's due before weekends move it.
  anchor_day: int

  @property
  def monthly_amount(self) -> int:
    return round(self.typical_amount * RHYTHMS[self.cadence].per_month)


@dataclass(frozen=True)
class _Payment:
  day: date
  amount: int
  row: RecurringRow


def _label(row: RecurringRow) -> str:
  if row.name:
    return row.name
  cleaned = " ".join(_VARYING.sub(" ", row.description or "").split())
  return cleaned or (row.description or "").strip() or "No description"


def group_key(row: RecurringRow) -> str:
  owner = "company" if row.business else "personal"
  return f"{row.direction.value}|{row.currency}|{owner}|{_label(row).casefold()}"


def _same(a: int, b: int, share: float) -> bool:
  return abs(a - b) <= share * max(a, b)


def _payments(rows: Sequence[RecurringRow]) -> list[_Payment]:
  """One per day: two charges on one day are one payment."""
  by_day: dict[date, list[RecurringRow]] = defaultdict(list)
  for row in rows:
    by_day[row.transaction_date].append(row)
  return [_Payment(day, sum(r.amount for r in same_day), same_day[-1]) for day, same_day in sorted(by_day.items())]


def _cadence_of(gap: int) -> Cadence | None:
  for cadence, rhythm in RHYTHMS.items():
    if rhythm.low <= gap <= rhythm.high:
      return cadence
  return None


def _regular_tail(payments: list[_Payment]) -> tuple[Cadence, list[_Payment]] | None:
  """The latest run of payments that keeps one rhythm, if it's long enough to trust."""
  if len(payments) < 2:
    return None
  cadence = _cadence_of((payments[-1].day - payments[-2].day).days)
  if cadence is None:
    return None
  rhythm = RHYTHMS[cadence]
  start, regular, skipped = len(payments) - 1, 0, 0
  while start > 0:
    gap = (payments[start].day - payments[start - 1].day).days
    if rhythm.low <= gap <= rhythm.high:
      regular += 1
    elif 2 * rhythm.low <= gap <= 2 * rhythm.high and skipped + 1 <= max(1, MAX_SKIPPED * (regular + skipped + 1)):
      skipped += 1
    else:
      break
    start -= 1
  tail = payments[start:]
  if regular + 1 < rhythm.min_count:
    return None
  if cadence == Cadence.weekly:
    middle = median(p.amount for p in tail)
    if any(not _same(p.amount, int(middle), WEEKLY_SPREAD) for p in tail):
      return None
  return cadence, tail


def _clusters(payments: list[_Payment]) -> Iterator[list[_Payment]]:
  ordered = sorted(payments, key=lambda p: p.amount)
  cluster = [ordered[0]]
  for payment in ordered[1:]:
    if _same(payment.amount, cluster[-1].amount, SAME_CLUSTER):
      cluster.append(payment)
    else:
      yield sorted(cluster, key=lambda p: p.day)
      cluster = [payment]
  yield sorted(cluster, key=lambda p: p.day)


def _price_changes(tail: list[_Payment]) -> tuple[PriceChange, ...]:
  """Where a price that held for two payments or more changed and, unless it's the latest, held again."""
  changes = []
  amounts = [p.amount for p in tail]
  for i in range(2, len(tail)):
    held_before = _same(amounts[i - 1], amounts[i - 2], SAME_PRICE)
    holds_after = i == len(tail) - 1 or _same(amounts[i + 1], amounts[i], SAME_PRICE)
    if not _same(amounts[i], amounts[i - 1], SAME_PRICE) and held_before and holds_after:
      changes.append(PriceChange(tail[i].day, amounts[i - 1], amounts[i]))
  return tuple(changes)


def _anchor_day(cadence: Cadence, tail: list[_Payment]) -> int:
  """The most common due day of the latest payments; weekends only move a few of them."""
  recent = tail[-6:]
  days = [p.day.weekday() if cadence == Cadence.weekly else p.day.day for p in recent]
  counts = Counter(days)
  best = max(counts.values())
  return min(day for day, count in counts.items() if count == best)


def _banking_day(day: date, direction: TransactionDirection) -> date:
  """A payment due at a weekend: money out goes the next weekday (autogiro), money in comes the one before (salary)."""
  if day.weekday() < 5:
    return day
  if direction == TransactionDirection.debit:
    return day + timedelta(days=7 - day.weekday())
  return day - timedelta(days=day.weekday() - 4)


def _on_day(month: date, day: int) -> date:
  return month.replace(day=min(day, (month + relativedelta(day=31)).day))


def due_dates(series: Series, *, after: date) -> Iterator[date]:
  """The days the series is due on after `after`, in order, without end."""
  rhythm = RHYTHMS[series.cadence]
  last = series.last_date
  if series.cadence == Cadence.weekly:
    step = 1
    while True:
      due = last + timedelta(days=7 * step)
      if due > after:
        yield due
      step += 1
  # The scheduled day the last payment was for: a weekend may have moved it into the next month.
  first = last.replace(day=1)
  scheduled = min((_on_day(m, series.anchor_day) for m in (first, first - relativedelta(months=1))), key=lambda d: abs((d - last).days))
  step = 1
  while True:
    due = _banking_day(_on_day(scheduled + relativedelta(months=rhythm.months * step), series.anchor_day), series.direction)
    if due > after:
      yield due
    step += 1


def occurrences(series: Series, start: date, end: date) -> list[date]:
  """The days the series is expected on between two days (inclusive): what a cash-flow forecast plots."""
  if series.next_date is None:
    return []
  days = []
  for day in due_dates(series, after=series.last_date):
    if day > end:
      break
    if day >= start:
      days.append(day)
  return days


def _kind(direction: TransactionDirection, label: str) -> RecurringKind:
  if direction == TransactionDirection.credit:
    return RecurringKind.income
  return RecurringKind.subscription if _SUBSCRIPTION.search(label.casefold()) else RecurringKind.bill


def _series(key: str, cadence: Cadence, tail: list[_Payment], today: date) -> Series:
  rhythm = RHYTHMS[cadence]
  last = tail[-1]
  changes = _price_changes(tail)
  # A price change explains the amounts before it; only changes since then make the series vary.
  since = changes[-1].day if changes else tail[0].day
  recent = [p.amount for p in tail[-3:] if p.day >= since]
  variable = any(not _same(a, last.amount, SAME_PRICE) for a in recent)
  typical = int(median(recent)) if variable else last.amount
  draft = Series(
    key=key,
    name=_label(last.row),
    kind=_kind(last.row.direction, _label(last.row)),
    cadence=cadence,
    currency=last.row.currency,
    direction=last.row.direction,
    business=last.row.business,
    bank_account_id=last.row.bank_account_id,
    logo_url=next((p.row.logo_url for p in reversed(tail) if p.row.logo_url), None),
    typical_amount=typical,
    variable=variable,
    count=len(tail),
    first_date=tail[0].day,
    last_date=last.day,
    last_amount=last.amount,
    status=Status.active,
    next_date=None,
    price_changes=changes,
    anchor_day=_anchor_day(cadence, tail),
  )
  dues = due_dates(draft, after=last.day)
  next_due, following = next(dues), next(dues)
  if today <= next_due + timedelta(days=rhythm.grace):
    status = Status.active
  elif today <= following + timedelta(days=rhythm.grace):
    status = Status.late
  else:
    return replace(draft, status=Status.ended)
  return replace(draft, status=status, next_date=next_due)


def detect(rows: Sequence[RecurringRow], *, today: date) -> list[Series]:
  """Every recurring series in the rows, the latest payment first."""
  groups: dict[str, list[RecurringRow]] = defaultdict(list)
  for row in rows:
    groups[group_key(row)].append(row)
  found: list[Series] = []
  for key, members in groups.items():
    payments = _payments(members)
    whole = _regular_tail(payments)
    parts = [tail for cluster in _clusters(payments) if (tail := _regular_tail(cluster))]
    # The whole group keeps time when its price rose by a lot, or when the bill varies month to month.
    if whole and len(whole[1]) >= max((len(tail) for _, tail in parts), default=0):
      parts = [whole]
    found.extend(_series(key, cadence, tail, today) for cadence, tail in parts)
  return sorted(found, key=lambda s: (s.last_date, s.key), reverse=True)
