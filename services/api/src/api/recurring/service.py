"""Recurring series as the user sees them: detected from the transactions, with their own reviews laid on top."""

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from uuid import UUID

from api.models.recurring_series import RecurringDecision, RecurringKind, RecurringSeries
from api.models.transaction import TransactionDirection
from api.postgres import AsyncSession
from api.recurring.detection import HISTORY, Series, RecurringStatus, detect, occurrences
from api.recurring.repository import RecurringSeriesRepository
from api.recurring.schemas import PriceChangeSchema, RecurringResponse, RecurringSeriesSchema, RecurringTotal, UpcomingPayment
from api.transactions.repository import TransactionRepository


@dataclass(frozen=True)
class ReviewedSeries:
  series: Series
  review: RecurringSeries | None

  @property
  def name(self) -> str:
    return (self.review.name if self.review else None) or self.series.name

  @property
  def kind(self) -> RecurringKind:
    return (self.review.kind if self.review else None) or self.series.kind

  @property
  def decision(self) -> RecurringDecision | None:
    return self.review.decision if self.review else None

  @property
  def expected(self) -> bool:
    """Still running and wanted: what upcoming payments and totals count."""
    return self.decision != RecurringDecision.dismissed and self.series.status != RecurringStatus.ended


@dataclass(frozen=True)
class ExpectedPayment:
  """One payment a series is expected to make, for upcoming bills and a cash-flow forecast."""

  reviewed: ReviewedSeries
  day: date
  amount: int
  # Due before the window began and not seen yet.
  late: bool = False


def _match(found: Sequence[Series], reviews: Sequence[RecurringSeries]) -> list[ReviewedSeries]:
  """Each review goes to the series of its group nearest the amount it was made at, so it follows a price change."""
  by_key: dict[str, list[RecurringSeries]] = defaultdict(list)
  for review in reviews:
    by_key[review.key].append(review)
  matched: dict[int, RecurringSeries] = {}
  for key, keyed in by_key.items():
    candidates = [i for i, s in enumerate(found) if s.key == key]
    pairs = sorted(
      ((abs(found[i].typical_amount - review.typical_amount), i, n) for i in candidates for n, review in enumerate(keyed)),
      key=lambda pair: pair[:2],
    )
    taken: set[int] = set()
    for _, index, n in pairs:
      if index not in matched and n not in taken:
        matched[index] = keyed[n]
        taken.add(n)
  return [ReviewedSeries(series, matched.get(i)) for i, series in enumerate(found)]


async def reviewed_series(session: AsyncSession, user_id: UUID, *, today: date) -> list[ReviewedSeries]:
  rows = await TransactionRepository.from_session(session).recurring_rows(user_id, since=today - HISTORY)
  reviews = await RecurringSeriesRepository.from_session(session).list_for_user(user_id)
  return _match(detect(rows, today=today), reviews)


def expected_between(reviewed: Sequence[ReviewedSeries], start: date, end: date) -> list[ExpectedPayment]:
  """Every payment expected between two days (inclusive), soonest first, after any late one still expected."""
  payments = []
  for item in reviewed:
    if not item.expected:
      continue
    due = item.series.next_date
    if item.series.status == RecurringStatus.late and due is not None and due < start:
      payments.append(ExpectedPayment(item, due, item.series.typical_amount, late=True))
    payments.extend(ExpectedPayment(item, day, item.series.typical_amount) for day in occurrences(item.series, start, end))
  return sorted(payments, key=lambda p: (p.day, p.reviewed.name))


async def expected_payments(session: AsyncSession, user_id: UUID, *, today: date, start: date, end: date) -> list[ExpectedPayment]:
  return expected_between(await reviewed_series(session, user_id, today=today), start, end)


def monthly_totals(reviewed: Sequence[ReviewedSeries]) -> list[RecurringTotal]:
  totals: dict[tuple[str, bool], RecurringTotal] = {}
  for item in reviewed:
    if not item.expected:
      continue
    series = item.series
    total = totals.setdefault(
      (series.currency, series.business), RecurringTotal(currency=series.currency, is_business=series.business, money_out=0, subscriptions=0, money_in=0)
    )
    if series.direction == TransactionDirection.credit:
      total.money_in += series.monthly_amount
    else:
      total.money_out += series.monthly_amount
      if item.kind == RecurringKind.subscription:
        total.subscriptions += series.monthly_amount
  return sorted(totals.values(), key=lambda t: (t.is_business, -t.money_out, t.currency))


def to_schema(item: ReviewedSeries) -> RecurringSeriesSchema:
  series = item.series
  return RecurringSeriesSchema(
    key=series.key,
    review_id=item.review.id if item.review else None,
    decision=item.decision,
    name=item.name,
    detected_name=series.name,
    kind=item.kind,
    cadence=series.cadence,
    currency=series.currency,
    direction=series.direction,
    is_business=series.business,
    bank_account_id=series.bank_account_id,
    logo_url=series.logo_url,
    typical_amount=series.typical_amount,
    variable=series.variable,
    monthly_amount=series.monthly_amount,
    count=series.count,
    first_date=series.first_date,
    last_date=series.last_date,
    last_amount=series.last_amount,
    status=series.status,
    next_date=series.next_date,
    next_amount=series.typical_amount if series.next_date else None,
    price_changes=[PriceChangeSchema(date=c.day, old_amount=c.old_amount, new_amount=c.new_amount) for c in series.price_changes],
  )


def to_upcoming(payment: ExpectedPayment) -> UpcomingPayment:
  series = payment.reviewed.series
  return UpcomingPayment(
    key=series.key,
    typical_amount=series.typical_amount,
    name=payment.reviewed.name,
    kind=payment.reviewed.kind,
    date=payment.day,
    amount=payment.amount,
    currency=series.currency,
    direction=series.direction,
    is_business=series.business,
    bank_account_id=series.bank_account_id,
    late=payment.late,
  )


async def overview(session: AsyncSession, user_id: UUID, *, today: date, days: int) -> RecurringResponse:
  reviewed = await reviewed_series(session, user_id, today=today)
  return RecurringResponse(
    series=[to_schema(item) for item in reviewed],
    upcoming=[to_upcoming(p) for p in expected_between(reviewed, today, today + timedelta(days=days - 1))],
    totals=monthly_totals(reviewed),
  )
