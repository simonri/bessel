"""A month of the user's own money: what came in, what went out and where it went."""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from uuid import UUID

from api.models.transaction import TransactionDirection
from api.postgres import AsyncSession
from api.transactions.repository import ReportRow, TransactionRepository
from api.transactions.schemas import CurrencySummary, SummaryCategory, SummaryMerchant, SummaryMonth, TransactionSummaryResponse
from dateutil.relativedelta import relativedelta

HISTORY_MONTHS = 12
AVERAGE_MONTHS = 6
TOP_MERCHANTS = 10
UNCATEGORIZED = ("Uncategorized", "#6B7280")


@dataclass
class _Bucket:
  income: int = 0
  spending: int = 0


@dataclass
class _Group:
  total: int = 0
  count: int = 0


@dataclass
class _Currency:
  months: dict[tuple[int, int], _Bucket] = field(default_factory=lambda: defaultdict(_Bucket))
  categories: dict[UUID | None, _Group] = field(default_factory=lambda: defaultdict(_Group))
  category_details: dict[UUID | None, tuple[str, str]] = field(default_factory=dict)
  merchants: dict[str, _Group] = field(default_factory=lambda: defaultdict(_Group))


def _spent(row: ReportRow) -> int:
  """What the row adds to spending: a purchase adds, a refund takes back, income adds nothing."""
  if row.direction == TransactionDirection.debit:
    return row.amount
  return -row.amount if row.refund else 0


def summarize(rows: list[ReportRow], *, year: int, month: int, uncategorized: int, transfers: int) -> TransactionSummaryResponse:
  first = date(year, month, 1)
  window = [first - relativedelta(months=back) for back in reversed(range(HISTORY_MONTHS))]
  currencies: dict[str, _Currency] = defaultdict(_Currency)
  for row in rows:
    summary = currencies[row.currency]
    bucket = summary.months[(row.transaction_date.year, row.transaction_date.month)]
    spent = _spent(row)
    bucket.spending += spent
    if row.direction == TransactionDirection.credit and not row.refund:
      bucket.income += row.amount
    if (row.transaction_date.year, row.transaction_date.month) != (year, month) or not spent:
      continue
    category = summary.categories[row.category_id]
    category.total += spent
    category.count += 1
    summary.category_details[row.category_id] = (row.category_name or UNCATEGORIZED[0], row.category_color or UNCATEGORIZED[1])
    merchant = summary.merchants[row.description or "No description"]
    merchant.total += spent
    merchant.count += 1

  def month_of(summary: _Currency, day: date) -> SummaryMonth:
    bucket = summary.months.get((day.year, day.month), _Bucket())
    return SummaryMonth(year=day.year, month=day.month, income=bucket.income, spending=bucket.spending)

  results = []
  for currency, summary in currencies.items():
    history = [month_of(summary, day) for day in window]
    current, before = history[-1], history[-1 - AVERAGE_MONTHS : -1]
    results.append(
      CurrencySummary(
        currency=currency,
        income=current.income,
        spending=current.spending,
        net=current.income - current.spending,
        previous=history[-2],
        average_income=sum(m.income for m in before) // len(before),
        average_spending=sum(m.spending for m in before) // len(before),
        months=history,
        categories=sorted(
          (
            SummaryCategory(
              category_id=category_id,
              name=summary.category_details[category_id][0],
              color=summary.category_details[category_id][1],
              total=group.total,
              count=group.count,
            )
            for category_id, group in summary.categories.items()
          ),
          key=lambda c: -c.total,
        ),
        merchants=sorted(
          (
            SummaryMerchant(description=description, total=group.total, count=group.count)
            for description, group in summary.merchants.items()
            if group.total > 0
          ),
          key=lambda m: -m.total,
        )[:TOP_MERCHANTS],
      )
    )
  return TransactionSummaryResponse(
    year=year, month=month, currencies=sorted(results, key=lambda c: -c.spending), uncategorized=uncategorized, transfers=transfers
  )


async def month_summary(session: AsyncSession, user_id: UUID, *, year: int, month: int) -> TransactionSummaryResponse:
  repository = TransactionRepository.from_session(session)
  first = date(year, month, 1)
  last = first + relativedelta(months=1, days=-1)
  rows = await repository.report_rows(user_id, start=first - relativedelta(months=HISTORY_MONTHS - 1), end=last)
  this_month = [row for row in rows if row.transaction_date >= first]
  return summarize(
    rows,
    year=year,
    month=month,
    uncategorized=sum(1 for row in this_month if row.category_id is None),
    transfers=await repository.count_left_out_as_transfers(user_id, start=first, end=last),
  )
