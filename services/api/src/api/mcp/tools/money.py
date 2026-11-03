"""Read-only views of the user's money: accounts, monthly summaries, transactions, recurring payments and investments.

Nothing here changes financial data. Amounts are in currency units (e.g. 1299.5 SEK), never öre or cents,
and always next to their currency.
"""

import re
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from mcp.server.mcpserver import Context
from mcp.server.mcpserver.exceptions import ToolError
from pydantic import Field

from api.bank_accounts.repository import BankAccountRepository
from api.bank_accounts.service import accounts_overview, net_worth_history
from api.categories.repository import CategoryRepository
from api.common.schemas import Schema
from api.common.utils import utc_now
from api.documents.repository import DocumentRepository
from api.investments import schemas as investments
from api.investments.kinds import investment_kind
from api.investments.service import investment_service
from api.mcp.context import user_session
from api.mcp.dates import Day, TimezoneParam, check_order, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read
from api.models.bank_account import BankAccount
from api.models.category import Category
from api.models.transaction import Transaction as TransactionModel
from api.models.transaction import TransactionDirection
from api.recurring.service import expected_between, monthly_totals, reviewed_series
from api.transactions.repository import TransactionRepository
from api.transactions.summary import month_summary
from api.transactions.tags import tag_summaries

NET_WORTH_MONTHS = 12
MAX_TRANSACTIONS = 200
_MONTH = re.compile(r"^(\d{4})-(\d{2})$")


def money(minor: int) -> float:
  """Minor units (öre, cents) as currency units."""
  return round(minor / 100, 2)


def _month_key(day: date) -> str:
  return f"{day:%Y-%m}"


def match_name[T: (BankAccount, Category)](name: str, items: Sequence[T], kind: str) -> T:
  """The account or category `name` refers to: exact (any case), else the only one starting with or containing it."""
  wanted = name.strip().casefold()
  for candidates in (
    [i for i in items if i.name.casefold() == wanted],
    [i for i in items if wanted and i.name.casefold().startswith(wanted)],
    [i for i in items if wanted and wanted in i.name.casefold()],
  ):
    if len(candidates) == 1:
      return candidates[0]
    if len(candidates) > 1:
      raise ToolError(f"{name!r} matches several {kind}s: {', '.join(i.name for i in candidates)}. Use the full name.")
  names = ", ".join(sorted(i.name for i in items)) or "none"
  raise ToolError(f"No {kind} called {name!r}. The user's {kind}s: {names}.")


def match_tag(name: str, tags: Sequence[str]) -> str:
  """The user's tag `name` refers to, in any case."""
  wanted = name.strip().casefold()
  for tag in tags:
    if tag.casefold() == wanted:
      return tag
  raise ToolError(f"No tag called {name!r}. The user's tags: {', '.join(sorted(tags, key=str.casefold)) or 'none'}.")


# ─── Overview ───


class Account(Schema):
  name: str
  owner: Literal["personal", "company"]
  kind: Literal["cash", "investments", "credit"]
  currency: str
  balance: float = Field(description="Cash in the account by Bessel's count; for credit accounts below zero when money is owed.")
  holdings_value: float | None = Field(description="What the investments in it are worth; null for other accounts.")
  counts_toward_net_worth: bool
  source: str = Field(description="Where its transactions come from, such as 'Skandia', 'Avanza' or 'Imported by hand'.")
  last_synced: datetime | None
  last_transaction: date | None
  needs_attention: str | None = Field(description="What the user should do about it, such as renewing a bank approval; null when all is well.")


class Total(Schema):
  owner: Literal["personal", "company"]
  currency: str
  cash: float
  investments: float = Field(description="Holdings plus cash in investment accounts.")
  debt: float = Field(description="What is owed on credit accounts, as a positive amount.")
  net: float


class NetWorthMonth(Schema):
  month: str = Field(description="YYYY-MM.")
  value: float = Field(description="Net worth at the end of the month, or today for the current one.")


class NetWorth(Schema):
  currency: str
  months: list[NetWorthMonth] = Field(description=f"Up to the last {NET_WORTH_MONTHS} months, oldest first.")


class FinancesOverview(Schema):
  accounts: list[Account]
  totals: list[Total] = Field(description="Per owner and currency; currencies are never added together.")
  net_worth: list[NetWorth] = Field(description="Personal and company accounts that count toward net worth, together, per currency.")


def _month_ends(points: Sequence[tuple[date, int]]) -> list[NetWorthMonth]:
  latest: dict[str, int] = {}
  for day, value in points:
    latest[_month_key(day)] = value
  return [NetWorthMonth(month=month, value=money(value)) for month, value in sorted(latest.items())[-NET_WORTH_MONTHS:]]


async def get_finances_overview(ctx: Context, timezone: TimezoneParam = None) -> FinancesOverview:
  """Every account with its balance and anything that needs attention, the totals for the user and their company,
  and net worth month by month over the last year.

  Use it for "how am I doing financially", "what's my net worth" and to check whether any bank connection needs
  renewing before giving money advice. The company's accounts belong to the user's own aktiebolag, not to the user.
  """
  async with user_session(ctx) as (session, user):
    zone = resolve_timezone(user, timezone)
    today = today_in(zone)
    overview = await accounts_overview.overview(session, user.id, now=utc_now(), zone=zone)
    history = await net_worth_history.history(session, user.id, today=today)
  return FinancesOverview(
    accounts=[
      Account(
        name=a.name,
        owner="company" if a.is_business else "personal",
        kind=a.group,
        currency=a.currency,
        balance=money(a.current_balance),
        holdings_value=money(a.holdings_value) if a.holdings_value is not None else None,
        counts_toward_net_worth=a.include_in_net_worth,
        source=a.source.label,
        last_synced=a.source.synced_at,
        last_transaction=a.last_transaction,
        needs_attention=a.source.problem,
      )
      for a in overview.accounts
    ],
    totals=[
      Total(owner=t.owner, currency=t.currency, cash=money(t.cash), investments=money(t.investments), debt=money(t.debt), net=money(t.net))
      for t in overview.totals
    ],
    net_worth=[NetWorth(currency=s.currency, months=_month_ends([(p.day, p.value) for p in s.points])) for s in history.series],
  )


# ─── Month summary ───

Month = Annotated[str, Field(description="'this month', 'last month' or YYYY-MM.")]


def parse_month(text: str, today: date) -> tuple[int, int]:
  match text.strip().casefold():
    case "this month" | "":
      return today.year, today.month
    case "last month":
      return (today.year, today.month - 1) if today.month > 1 else (today.year - 1, 12)
  found = _MONTH.match(text.strip())
  if found is None or not 1 <= int(found[2]) <= 12:
    raise ToolError(f"Write the month as 'this month', 'last month' or YYYY-MM; got {text!r}.")
  return int(found[1]), int(found[2])


class CategorySpend(Schema):
  category: str
  spent: float = Field(description="Spending less refunds.")
  transactions: int


class MerchantSpend(Schema):
  merchant: str = Field(description="The user's name for it, or the bank's text.")
  spent: float
  transactions: int


class MonthTotals(Schema):
  month: str = Field(description="YYYY-MM.")
  income: float
  spending: float


class CurrencyMonth(Schema):
  currency: str
  income: float = Field(description="Money in under income categories (salary, dividends, sales); refunds lower spending instead.")
  spending: float = Field(description="Money out less refunds.")
  net: float
  average_income_6_months: float = Field(description="Over the six months before this one.")
  average_spending_6_months: float = Field(description="Over the six months before this one.")
  categories: list[CategorySpend] = Field(description="This month's spending per category, largest first.")
  top_merchants: list[MerchantSpend] = Field(description="This month's biggest spending by merchant, largest first.")
  last_12_months: list[MonthTotals] = Field(description="Oldest first, ending with this month.")


class MonthSummary(Schema):
  month: str = Field(description="YYYY-MM.")
  currencies: list[CurrencyMonth] = Field(description="One per currency, never added together.")
  uncategorized: int = Field(description="This month's counted transactions still without a category; their spending shows as 'Uncategorized'.")
  transfers_left_out: int = Field(description="Moves between the user's own accounts, which count as neither income nor spending.")


async def get_month_summary(ctx: Context, month: Month = "this month", timezone: TimezoneParam = None) -> MonthSummary:
  """The user's own income and spending for a month: per category, the biggest merchants, the six-month averages and
  the twelve months before it.

  It is the user's personal money only, counted like the app's reports: the company's accounts, investment accounts,
  moves between the user's own accounts and categories left out of reports (such as company costs paid privately)
  don't count. For the company's money, use search_transactions with company=true.
  """
  async with user_session(ctx) as (session, user):
    year, number = parse_month(month, today_in(resolve_timezone(user, timezone)))
    summary = await month_summary(session, user.id, year=year, month=number)
  return MonthSummary(
    month=f"{year:04d}-{number:02d}",
    currencies=[
      CurrencyMonth(
        currency=c.currency,
        income=money(c.income),
        spending=money(c.spending),
        net=money(c.net),
        average_income_6_months=money(c.average_income),
        average_spending_6_months=money(c.average_spending),
        categories=[CategorySpend(category=k.name, spent=money(k.total), transactions=k.count) for k in c.categories],
        top_merchants=[MerchantSpend(merchant=m.description, spent=money(m.total), transactions=m.count) for m in c.merchants],
        last_12_months=[MonthTotals(month=f"{m.year:04d}-{m.month:02d}", income=money(m.income), spending=money(m.spending)) for m in c.months],
      )
      for c in summary.currencies
    ],
    uncategorized=summary.uncategorized,
    transfers_left_out=summary.transfers,
  )


# ─── Transactions ───


class Transaction(Schema):
  id: UUID
  date: date
  name: str | None = Field(description="What the user calls it, or the bank's text when they haven't named it.")
  bank_text: str | None = Field(description="The bank's own text.")
  note: str | None = Field(description="The user's own words about it.")
  amount: float = Field(description="Always positive; see `direction`.")
  currency: str
  direction: Literal["out", "in"]
  category: str | None
  account: str
  company: bool = Field(description="The company's money: on a company account, or a company cost the user paid privately.")
  transfer: bool = Field(description="A move between the user's own accounts.")
  investment_kind: str | None = Field(description="For an investment account's movement, what it is, such as a buy, a dividend or a tax.")
  invoices: int = Field(description="Invoices and receipts kept with it.")
  tags: list[str]


class Transactions(Schema):
  total_count: int = Field(description="Matching transactions, including any beyond `limit`.")
  transactions: list[Transaction] = Field(description="Newest first.")


async def search_transactions(
  ctx: Context,
  start: Annotated[Day | None, Field(description="Earliest day, inclusive. Leave out for no lower bound.")] = None,
  end: Annotated[Day | None, Field(description="Latest day, inclusive. Leave out for no upper bound.")] = None,
  text: Annotated[str | None, Field(description="Case-insensitive text in the bank text, the user's name for it or its note, e.g. a merchant.")] = None,
  category: Annotated[str | None, Field(description="A category name, as in get_month_summary.")] = None,
  account: Annotated[str | None, Field(description="An account name, as in get_finances_overview.")] = None,
  direction: Annotated[Literal["out", "in"] | None, Field(description="'out' for money spent, 'in' for money received.")] = None,
  company: Annotated[bool | None, Field(description="true for only the company's money, false for only the user's own.")] = None,
  uncategorized: Annotated[bool, Field(description="Only transactions still waiting for a category.")] = False,
  tag: Annotated[str | None, Field(description="One of the user's tags, in any case.")] = None,
  limit: Annotated[int, Field(ge=1, le=MAX_TRANSACTIONS)] = 50,
  timezone: TimezoneParam = None,
) -> Transactions:
  """Transactions across all accounts, newest first, filtered by days, text, category, account, direction, owner or tag.

  Use it to look into a month's spending, find a payment ("when did I last pay the dentist"), list the company's
  costs, or see what still needs a category. Moves between the user's own accounts are included and marked `transfer`.
  """
  async with user_session(ctx) as (session, user):
    today = today_in(resolve_timezone(user, timezone))
    date_from, date_to = (parse_day(start, today) if start else None), (parse_day(end, today) if end else None)
    check_order(date_from, date_to)
    accounts = await BankAccountRepository.from_session(session).list_for_user(user.id)
    categories = await CategoryRepository.from_session(session).list_for_user(user.id, order_by=Category.name)
    repository = TransactionRepository.from_session(session)
    tags = [match_tag(tag, await repository.tag_usage(user.id))] if tag is not None else None
    statement = repository.get_filtered_statement(
      user.id,
      bank_account_ids=[match_name(account, accounts, "account").id] if account else None,
      category_ids=[match_name(category, categories, "category").id] if category else None,
      uncategorized=uncategorized,
      direction={"out": TransactionDirection.debit, "in": TransactionDirection.credit}[direction] if direction else None,
      search=(text.strip() or None) if text else None,
      date_from=date_from,
      date_to=date_to,
      is_business=company,
      tags=tags,
    ).order_by(TransactionModel.transaction_date.desc(), TransactionModel.id)
    rows, total_count = await repository.paginate(statement, limit=limit, page=1)
    documents = await DocumentRepository.from_session(session).counts_for_transactions([t.id for t in rows])
  by_account = {a.id: a for a in accounts}
  category_names = {c.id: c.name for c in categories}
  return Transactions(
    total_count=total_count,
    transactions=[
      Transaction(
        id=t.id,
        date=t.transaction_date,
        name=t.name or t.description,
        bank_text=t.description,
        note=t.note,
        amount=money(t.amount),
        currency=t.currency,
        direction="out" if t.direction == TransactionDirection.debit else "in",
        category=category_names.get(t.category_id) if t.category_id else None,
        account=by_account[t.bank_account_id].name,
        company=t.is_business or by_account[t.bank_account_id].is_business,
        transfer=t.transfer_id is not None,
        investment_kind=investment_kind(t.transaction_type, t.description),
        invoices=documents.get(t.id, 0),
        tags=t.tags,
      )
      for t in rows
    ],
  )


# ─── Recurring payments ───

MAX_RECURRING_DAYS = 366


class RecurringSeries(Schema):
  name: str
  kind: Literal["bill", "subscription", "income"]
  cadence: Literal["weekly", "monthly", "quarterly", "yearly"]
  owner: Literal["personal", "company"]
  account: str
  currency: str
  amount: float = Field(description="The latest price, or recent typical amount when it varies (`varies`).")
  varies: bool
  per_month: float
  status: Literal["active", "late", "ended"] = Field(description="'late': the expected payment hasn't come; 'ended': two haven't.")
  confirmed: bool = Field(description="By the user; otherwise only detected.")
  last_paid: date
  next_due: date | None
  price_changes: list[str] = Field(description="Oldest first, e.g. '2026-09-12: 99.0 -> 129.0'.")


class DuePayment(Schema):
  date: date
  name: str
  kind: Literal["bill", "subscription", "income"]
  amount: float
  currency: str
  late: bool = Field(description="Was due before today and hasn't come.")


class RecurringTotal(Schema):
  owner: Literal["personal", "company"]
  currency: str
  money_out_per_month: float = Field(description="Bills and subscriptions.")
  subscriptions_per_month: float
  money_in_per_month: float


class RecurringPayments(Schema):
  series: list[RecurringSeries] = Field(description="Latest payment first; never ones the user dismissed.")
  due: list[DuePayment] = Field(description="Late payments, then those due in the next `days` days.")
  totals: list[RecurringTotal] = Field(description="Of series still running.")


async def get_recurring_payments(
  ctx: Context,
  kind: Literal["bill", "subscription", "income"] | None = None,
  days: Annotated[int, Field(ge=1, le=MAX_RECURRING_DAYS, description="How far ahead `due` looks.")] = 30,
  include_ended: bool = False,
  timezone: TimezoneParam = None,
) -> RecurringPayments:
  """Repeating bills, subscriptions and income found in the transactions: cadence, amount, next due, price
  changes and monthly totals: "what subscriptions do I have"."""
  async with user_session(ctx) as (session, user):
    today = today_in(resolve_timezone(user, timezone))
    reviewed = await reviewed_series(session, user.id, today=today)
    accounts = {a.id: a.name for a in await BankAccountRepository.from_session(session).list_for_user(user.id)}
  shown = [r for r in reviewed if r.decision != "dismissed" and (kind is None or r.kind == kind)]

  def owner(business: bool) -> Literal["personal", "company"]:
    return "company" if business else "personal"

  return RecurringPayments(
    series=[
      RecurringSeries(
        name=r.name,
        kind=r.kind.value,
        cadence=r.series.cadence.value,
        owner=owner(r.series.business),
        account=accounts.get(r.series.bank_account_id, "Unknown"),
        currency=r.series.currency,
        amount=money(r.series.typical_amount),
        varies=r.series.variable,
        per_month=money(r.series.monthly_amount),
        status=r.series.status.value,
        confirmed=r.decision == "confirmed",
        last_paid=r.series.last_date,
        next_due=r.series.next_date,
        price_changes=[f"{c.day}: {money(c.old_amount)} -> {money(c.new_amount)}" for c in r.series.price_changes],
      )
      for r in shown
      if include_ended or r.series.status != "ended"
    ],
    due=[
      DuePayment(
        date=p.day,
        name=p.reviewed.name,
        kind=p.reviewed.kind.value,
        amount=money(p.amount),
        currency=p.reviewed.series.currency,
        late=p.late,
      )
      for p in expected_between(shown, today, today + timedelta(days=days - 1))
    ],
    totals=[
      RecurringTotal(
        owner=owner(t.is_business),
        currency=t.currency,
        money_out_per_month=money(t.money_out),
        subscriptions_per_month=money(t.subscriptions),
        money_in_per_month=money(t.money_in),
      )
      for t in monthly_totals(reviewed)
    ],
  )


class TagCurrency(Schema):
  currency: str
  spent: float = Field(description="Money out.")
  received: float = Field(description="Money in, such as refunds or a friend's share.")


class TagSpend(Schema):
  tag: str
  transactions: int
  currencies: list[TagCurrency] = Field(description="One per currency, never added together.")


class TagSpending(Schema):
  tags: list[TagSpend]


async def get_tag_spending(
  ctx: Context,
  start: Annotated[Day | None, Field(description="First day; none for no bound.")] = None,
  end: Annotated[Day | None, Field(description="Last day; none for no bound.")] = None,
  company: Annotated[bool | None, Field(description="true: only the company's; false: only the user's.")] = None,
  timezone: TimezoneParam = None,
) -> TagSpending:
  """Money out and in per tag (a trip, a project): "what did the trip cost". Own-account moves are left out;
  search_transactions lists a tag's transactions."""
  async with user_session(ctx) as (session, user):
    today = today_in(resolve_timezone(user, timezone))
    date_from, date_to = (parse_day(start, today) if start else None), (parse_day(end, today) if end else None)
    check_order(date_from, date_to)
    summaries = await tag_summaries(session, user.id, date_from=date_from, date_to=date_to, is_business=company)
  return TagSpending(
    tags=[
      TagSpend(
        tag=s.tag,
        transactions=s.count,
        currencies=[TagCurrency(currency=t.currency, spent=money(t.spent), received=money(t.received)) for t in s.totals],
      )
      for s in summaries
    ]
  )


# ─── Investments ───


class YearAmount(Schema):
  year: int
  amount: float


class InvestmentAccount(Schema):
  name: str
  owner: Literal["personal", "company"]
  currency: str
  total: float = Field(description="Holdings plus cash.")
  holdings_value: float
  cash: float
  net_deposits: float = Field(description="Money put in minus money taken out.")
  growth: float = Field(description="Total minus net deposits: what the account made or lost overall.")
  dividends: list[YearAmount] = Field(description="Per year, newest first.")
  tax_and_fees: list[YearAmount] = Field(description="Per year, newest first, below zero.")


class Holding(Schema):
  name: str
  ticker: str | None
  type: str
  account: str | None
  currency: str
  quantity: float
  value: float | None = Field(description="Null when no price is known.")
  cost: float
  gain: float | None
  gain_pct: float | None


class InvestmentReturns(Schema):
  account: str | None = Field(description="Null for the currency's total.")
  currency: str
  start: date | None
  end: date | None
  gain: float | None = Field(description="Made beyond net deposits.")
  net_deposits: float | None
  time_weighted_pct: float | None = Field(description="Over the period.")
  money_weighted_pct: float | None = Field(description="XIRR over the period.")
  per_year_pct: float | None = Field(description="For a year or more.")
  unavailable: str | None = Field(description="Why a return is missing.")


class AllocationShare(Schema):
  name: str
  value: float
  pct: float


class InvestmentAllocation(Schema):
  currency: str
  total: float
  by_type: list[AllocationShare] = Field(description="Asset types, and cash.")
  by_account: list[AllocationShare]
  borrowed: float = Field(description="Not in the shares.")
  unpriced_holdings: int


class Investments(Schema):
  accounts: list[InvestmentAccount]
  holdings: list[Holding] = Field(description="Largest value first.")
  returns: list[InvestmentReturns] = Field(default_factory=list, description="Per account and currency total.")
  returns_left_out: list[str] = Field(default_factory=list, description="Not in the totals, and why.")
  allocation: list[InvestmentAllocation] = Field(default_factory=list, description="Per currency.")


def _per_year(*series: Sequence[investments.YearAmount]) -> list[YearAmount]:
  totals: dict[int, int] = {}
  for amounts in series:
    for item in amounts:
      totals[item.year] = totals.get(item.year, 0) + item.amount
  return [YearAmount(year=year, amount=money(amount)) for year, amount in sorted(totals.items(), reverse=True)]


def _pct(fraction: float | None) -> float | None:
  return round(fraction * 100, 2) if fraction is not None else None


async def get_investments(
  ctx: Context,
  period: Annotated[investments.PerformanceRange, Field(description="For the returns.")] = "1y",
  timezone: TimezoneParam = None,
) -> Investments:
  """Investment accounts' value, growth and dividends, positions and their gain, returns over a period, and
  allocation: "how are my investments doing"."""
  async with user_session(ctx) as (session, user):
    accounts = await investment_service.accounts(session, user.id)
    holdings = await investment_service.current_holdings(session, user.id)
    performance = await investment_service.performance(session, user.id, today=today_in(resolve_timezone(user, timezone)))
    allocation = await investment_service.allocation(session, user.id)
  names = {a.bank_account_id: a.name for a in accounts}
  return Investments(
    accounts=[
      InvestmentAccount(
        name=a.name,
        owner="company" if a.is_business else "personal",
        currency=a.currency,
        total=money(a.total),
        holdings_value=money(a.holdings_value),
        cash=money(a.cash),
        net_deposits=money(a.net_deposits),
        growth=money(a.growth),
        dividends=_per_year(a.dividends),
        tax_and_fees=_per_year(a.tax, a.fees),
      )
      for a in accounts
    ],
    holdings=[
      Holding(
        name=h.security_name,
        ticker=h.ticker,
        type=h.asset_type,
        account=names.get(h.bank_account_id) if h.bank_account_id else None,
        currency=h.currency,
        quantity=h.quantity / 1_000_000,
        value=money(h.current_value) if h.current_value is not None else None,
        cost=money(h.cost_basis),
        gain=money(h.gain_loss) if h.gain_loss is not None else None,
        gain_pct=round(h.gain_loss_pct, 2) if h.gain_loss_pct is not None else None,
      )
      for h in sorted(holdings, key=lambda h: -(h.current_value or 0))
    ],
    returns=[
      InvestmentReturns(
        account=names.get(r.bank_account_id) if r.bank_account_id else None,
        currency=r.currency,
        start=r.start,
        end=r.end,
        gain=money(r.gain) if r.gain is not None else None,
        net_deposits=money(r.net_flows) if r.net_flows is not None else None,
        time_weighted_pct=_pct(r.time_weighted),
        money_weighted_pct=_pct(r.money_weighted),
        per_year_pct=_pct(r.time_weighted_annualized),
        unavailable=r.time_weighted_unavailable or r.money_weighted_unavailable,
      )
      for r in performance.returns
      if r.range == period
    ],
    returns_left_out=[f"{a.name}: {a.reason}" for a in performance.left_out],
    allocation=[
      InvestmentAllocation(
        currency=item.currency,
        total=money(item.total),
        by_type=[AllocationShare(name=s.label, value=money(s.value), pct=_pct(s.share) or 0) for s in item.by_asset_type],
        by_account=[AllocationShare(name=s.label, value=money(s.value), pct=_pct(s.share) or 0) for s in item.by_account],
        borrowed=money(item.borrowed),
        unpriced_holdings=item.unpriced,
      )
      for item in allocation.items
    ],
  )


TOOLS: list[ToolSpec] = [
  read(get_finances_overview, "Finances overview"),
  read(get_month_summary, "Month summary", open_world=True),
  read(search_transactions, "Search transactions", open_world=True),
  read(get_tag_spending, "Tag spending"),
  read(get_investments, "Investments"),
  read(get_recurring_payments, "Recurring payments", open_world=True),
]
