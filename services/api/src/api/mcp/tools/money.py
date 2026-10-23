"""Read-only views of the user's money: accounts, monthly summaries, transactions and investments.

Nothing here changes financial data. Amounts are in currency units (e.g. 1299.5 SEK), never öre or cents,
and always next to their currency.
"""

import re
from collections.abc import Sequence
from datetime import date, datetime
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
from api.mcp.dates import Day, TimezoneParam, parse_day, resolve_timezone, today_in
from api.mcp.tools.common import ToolSpec, read
from api.models.bank_account import BankAccount
from api.models.category import Category
from api.models.transaction import Transaction as TransactionModel
from api.models.transaction import TransactionDirection
from api.transactions.repository import TransactionRepository
from api.transactions.summary import month_summary

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
    [i for i in items if i.name.casefold().startswith(wanted)],
    [i for i in items if wanted in i.name.casefold()],
  ):
    if len(candidates) == 1:
      return candidates[0]
    if len(candidates) > 1:
      raise ToolError(f"{name!r} matches several {kind}s: {', '.join(i.name for i in candidates)}. Use the full name.")
  names = ", ".join(sorted(i.name for i in items)) or "none"
  raise ToolError(f"No {kind} called {name!r}. The user's {kind}s: {names}.")


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
    today = today_in(resolve_timezone(user, timezone))
    overview = await accounts_overview.overview(session, user.id, now=utc_now())
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
  limit: Annotated[int, Field(ge=1, le=MAX_TRANSACTIONS)] = 50,
  timezone: TimezoneParam = None,
) -> Transactions:
  """Transactions across all accounts, newest first, filtered by days, text, category, account, direction or owner.

  Use it to look into a month's spending, find a payment ("when did I last pay the dentist"), list the company's
  costs, or see what still needs a category. Moves between the user's own accounts are included and marked `transfer`.
  """
  async with user_session(ctx) as (session, user):
    today = today_in(resolve_timezone(user, timezone))
    accounts = await BankAccountRepository.from_session(session).list_for_user(user.id)
    categories = await CategoryRepository.from_session(session).list_for_user(user.id, order_by=Category.name)
    repository = TransactionRepository.from_session(session)
    statement = repository.get_filtered_statement(
      user.id,
      bank_account_ids=[match_name(account, accounts, "account").id] if account else None,
      category_ids=[match_name(category, categories, "category").id] if category else None,
      uncategorized=uncategorized,
      direction={"out": TransactionDirection.debit, "in": TransactionDirection.credit}[direction] if direction else None,
      search=(text.strip() or None) if text else None,
      date_from=parse_day(start, today) if start else None,
      date_to=parse_day(end, today) if end else None,
      is_business=company,
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
      )
      for t in rows
    ],
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


class Investments(Schema):
  accounts: list[InvestmentAccount]
  holdings: list[Holding] = Field(description="Largest value first.")


def _per_year(*series: Sequence[investments.YearAmount]) -> list[YearAmount]:
  totals: dict[int, int] = {}
  for amounts in series:
    for item in amounts:
      totals[item.year] = totals.get(item.year, 0) + item.amount
  return [YearAmount(year=year, amount=money(amount)) for year, amount in sorted(totals.items(), reverse=True)]


async def get_investments(ctx: Context) -> Investments:
  """Each investment account's value, growth and dividends, and every position held now with its gain.

  Use it for "how are my investments doing", dividend income, or how the user's and the company's portfolios are spread.
  """
  async with user_session(ctx) as (session, user):
    accounts = await investment_service.accounts(session, user.id)
    holdings = await investment_service.current_holdings(session, user.id)
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
  )


TOOLS: list[ToolSpec] = [
  read(get_finances_overview, "Finances overview"),
  read(get_month_summary, "Month summary"),
  read(search_transactions, "Search transactions"),
  read(get_investments, "Investments"),
]
