from collections.abc import Sequence
from datetime import date
from uuid import UUID

from dateutil.relativedelta import relativedelta
from sqlalchemy import Row

from api.avanza.repository import AvanzaAccountRepository, HoldingSnapshotRepository
from api.bank_accounts.repository import BankAccountRepository
from api.investments.kinds import DEPOSIT_TYPES, InvestmentKind, investment_kind
from api.investments.repository import TradeRepository
from api.investments.returns import Ledger, Returns, combine, period_returns, unavailable, values_on
from api.investments.schemas import (
  PERFORMANCE_RANGES,
  AllocationSlice,
  CurrencyAllocation,
  HoldingSchema,
  InvestmentAccountSummary,
  InvestmentAllocationResponse,
  InvestmentPerformanceResponse,
  LeftOutAccount,
  PerformanceRange,
  PeriodReturns,
  PortfolioSeries,
  ValuePoint,
  YearAmount,
)
from api.models.bank_account import INVESTMENT_SUBTYPES, BankAccount
from api.montrose.repository import MontroseAccountRepository
from api.postgres import AsyncSession
from api.transactions.repository import TransactionRepository


def _per_year(amounts: dict[int, int]) -> list[YearAmount]:
  return [YearAmount(year=year, amount=amount) for year, amount in sorted(amounts.items(), reverse=True)]


class InvestmentService:
  async def holdings(
    self, repo: TradeRepository, user_id: UUID, *, synced_bank_account_ids: Sequence[UUID] = (), snapshots: Sequence[Row] = ()
  ) -> list[HoldingSchema]:
    """Current positions: from trades valued at each security's latest price, and for accounts a broker
    syncs, from its latest positions instead (trades miss splits and fund conversions)."""
    holdings = self._from_snapshots(snapshots)
    for row in await repo.holdings_rows(user_id, excluding_bank_account_ids=synced_bank_account_ids):
      net_qty = int(row.net_quantity)
      total_buy_qty = int(row.total_buy_qty)
      total_buy_cost = int(row.total_buy_cost)

      avg_cost = total_buy_cost // total_buy_qty if total_buy_qty > 0 else 0
      cost_basis = (net_qty * avg_cost) // 1_000_000

      current_price = int(row.current_price) if row.current_price is not None else None
      current_value = (net_qty * current_price) // 1_000_000 if current_price is not None else None
      gain_loss = current_value - cost_basis if current_value is not None else None
      gain_loss_pct = round(gain_loss / cost_basis * 100, 2) if gain_loss is not None and cost_basis > 0 else None

      holdings.append(
        HoldingSchema(
          security_id=row.id,
          security_name=row.name,
          ticker=row.ticker,
          asset_type=row.asset_type,
          currency=row.currency,
          quantity=net_qty,
          avg_cost_per_unit=avg_cost,
          cost_basis=cost_basis,
          current_price=current_price,
          current_value=current_value,
          gain_loss=gain_loss,
          gain_loss_pct=gain_loss_pct,
        )
      )
    return sorted(holdings, key=lambda h: h.security_name.lower())

  def _from_snapshots(self, snapshots: Sequence[Row]) -> list[HoldingSchema]:
    """One holding per account and security: the same fund in two accounts stays two positions."""
    totals: dict[tuple[UUID, UUID, str], list[int]] = {}
    details: dict[UUID, Row] = {}
    for row in snapshots:
      total = totals.setdefault((row.bank_account_id, row.security_id, row.currency), [0, 0, 0])
      total[0] += row.quantity
      total[1] += row.value
      total[2] += row.acquired_value
      details[row.security_id] = row
    holdings = []
    for (bank_account_id, security_id, currency), (quantity, value, acquired) in totals.items():
      if quantity <= 0:
        continue
      row = details[security_id]
      holdings.append(
        HoldingSchema(
          security_id=security_id,
          bank_account_id=bank_account_id,
          security_name=row.name,
          ticker=row.ticker,
          asset_type=row.asset_type,
          currency=currency,
          quantity=quantity,
          avg_cost_per_unit=acquired * 1_000_000 // quantity,
          cost_basis=acquired,
          current_price=value * 1_000_000 // quantity,
          current_value=value,
          gain_loss=value - acquired,
          gain_loss_pct=round((value - acquired) / acquired * 100, 2) if acquired > 0 else None,
        )
      )
    return holdings

  async def current_holdings(self, session: AsyncSession, user_id: UUID) -> list[HoldingSchema]:
    """What the user holds now, from the brokers' latest positions where they sync and from trades elsewhere."""
    synced = [
      *await AvanzaAccountRepository.from_session(session).linked_bank_account_ids(user_id),
      *await MontroseAccountRepository.from_session(session).linked_bank_account_ids(user_id),
    ]
    snapshots = await HoldingSnapshotRepository.from_session(session).latest_for_accounts(synced)
    return await self.holdings(TradeRepository.from_session(session), user_id, synced_bank_account_ids=synced, snapshots=snapshots)

  async def accounts(self, session: AsyncSession, user_id: UUID) -> list[InvestmentAccountSummary]:
    """Each investment account: what it's worth, what was put in and what it made."""
    accounts = await self._investment_accounts(session, user_id)
    ids = [a.id for a in accounts]
    transactions = TransactionRepository.from_session(session)
    balances = await transactions.net_balances_by_account(ids)
    activity = await transactions.account_activity(ids)
    flows = await transactions.flows_by_type(ids)
    by_kind: dict[UUID, dict[InvestmentKind, dict[int, int]]] = {}
    for account_id, transaction_type, description, year, net in await transactions.yearly_net_by_movement(ids):
      kind = investment_kind(transaction_type, description)
      if kind is not None:
        years = by_kind.setdefault(account_id, {}).setdefault(kind, {})
        years[year] = years.get(year, 0) + net
    value: dict[UUID, list[int]] = {account_id: [0, 0] for account_id in ids}
    for row in await HoldingSnapshotRepository.from_session(session).latest_for_accounts(ids):
      value[row.bank_account_id][0] += row.value
      value[row.bank_account_id][1] += row.acquired_value
    summaries = []
    for account in accounts:
      cash = account.base_balance + balances.get(account.id, 0)
      holdings_value, acquired = value[account.id]
      by_type = flows.get(account.id, {})
      deposits = sum(by_type.get("DEPOSIT", {}).values())
      withdrawals = -sum(by_type.get("WITHDRAW", {}).values())
      total = holdings_value + cash
      summaries.append(
        InvestmentAccountSummary(
          bank_account_id=account.id,
          name=account.name,
          is_business=account.is_business,
          currency=account.currency,
          holdings_value=holdings_value,
          cash=cash,
          total=total,
          acquired_value=acquired,
          deposits=deposits,
          withdrawals=withdrawals,
          net_deposits=deposits - withdrawals,
          growth=total - (deposits - withdrawals),
          dividends=_per_year(by_kind.get(account.id, {}).get("dividend", {})),
          interest=_per_year(by_kind.get(account.id, {}).get("interest", {})),
          tax=_per_year(by_kind.get(account.id, {}).get("tax", {})),
          fees=_per_year(by_kind.get(account.id, {}).get("fee", {})),
          first_transaction=activity.get(account.id, (None,))[0],
        )
      )
    return summaries

  async def _investment_accounts(self, session: AsyncSession, user_id: UUID) -> list[BankAccount]:
    return [a for a in await BankAccountRepository.from_session(session).list_for_user(user_id) if a.subtype in INVESTMENT_SUBTYPES]

  async def performance(self, session: AsyncSession, user_id: UUID, *, today: date) -> InvestmentPerformanceResponse:
    """Each account's value on the days its broker reported its positions, each currency's total, and their
    returns over each range, from those values and the deposits and withdrawals between them.

    The series end today, with today's cash and the latest positions, so their last value is what the accounts
    are worth now. Returns only use the days positions were reported."""
    accounts = await self._investment_accounts(session, user_id)
    ids = [a.id for a in accounts]
    transactions = TransactionRepository.from_session(session)
    net = _by_account(await transactions.daily_net_by_account(ids))
    deposits = _by_account(await transactions.daily_net_by_account(ids, transaction_types=DEPOSIT_TYPES))
    holdings = _by_account(await HoldingSnapshotRepository.from_session(session).daily_values(ids))
    activity = await transactions.account_activity(ids)

    series: list[PortfolioSeries] = []
    returns: list[PeriodReturns] = []
    left_out: list[LeftOutAccount] = []
    for currency in sorted({a.currency for a in accounts}):
      in_currency = [a for a in accounts if a.currency == currency]
      days = {day for a in in_currency for day in holdings.get(a.id, {})}
      counted: list[Ledger] = []
      everything: list[Ledger] = []
      for account in in_currency:
        snapshots = holdings.get(account.id, {})
        values = values_on(days | {today}, base_balance=account.base_balance, daily_net=net.get(account.id, {}), holdings=snapshots)
        own = Ledger(values={day: values[day] for day in snapshots}, flows=deposits.get(account.id, {}))
        own_series = {day: value for day, value in values.items() if day in snapshots or day == today}
        series.append(PortfolioSeries(bank_account_id=account.id, currency=currency, points=_points(own_series)))
        if not snapshots:
          reason = "Bessel has no daily values for this account. They come from a broker's sync of its positions."
        elif account.id not in activity:
          reason = "Bessel hasn't seen any money moved in or out of this account, so its gains can't be told apart from deposits."
        else:
          reason = None
        returns.extend(_ranges(own, account.id, currency, today=today, reason=reason))
        everything.append(Ledger(values=values))
        if reason is None:
          counted.append(Ledger(values={day: value for day, value in values.items() if day in days}, flows=own.flows))
        else:
          left_out.append(LeftOutAccount(bank_account_id=account.id, name=account.name, reason=reason))
      series.append(PortfolioSeries(bank_account_id=None, currency=currency, points=_points(combine(everything).values)))
      reason = "No account here has both daily values and deposits Bessel can count." if not counted and any(e.values for e in everything) else None
      returns.extend(_ranges(combine(counted), None, currency, today=today, reason=reason))
    return InvestmentPerformanceResponse(series=series, returns=returns, left_out=left_out)

  async def allocation(self, session: AsyncSession, user_id: UUID) -> InvestmentAllocationResponse:
    """What the investments are in per currency: by type of holding, with uninvested cash its own slice, and by account.

    Valued as the accounts' totals are, from each account's latest positions and its cash, so the slices plus what
    was borrowed add up to the accounts' totals. Positions worked out from trades have no price and are only counted."""
    summaries = await self.accounts(session, user_id)
    positions = await HoldingSnapshotRepository.from_session(session).latest_for_accounts([s.bank_account_id for s in summaries])
    from_trades = [h for h in await self.current_holdings(session, user_id) if h.bank_account_id is None]
    return self.allocation_of(summaries, self._from_snapshots(positions), unpriced=[h for h in from_trades if h.current_value is None])

  def allocation_of(
    self, summaries: Sequence[InvestmentAccountSummary], positions: Sequence[HoldingSchema], *, unpriced: Sequence[HoldingSchema] = ()
  ) -> InvestmentAllocationResponse:
    by_type: dict[str, dict[str, int]] = {}
    by_account: dict[str, dict[str, int]] = {}
    borrowed: dict[str, int] = {}
    unpriced_count: dict[str, int] = {}
    for holding in unpriced:
      unpriced_count[holding.currency] = unpriced_count.get(holding.currency, 0) + 1
    for holding in positions:
      value = holding.current_value or 0
      if value > 0:
        types = by_type.setdefault(holding.currency, {})
        types[holding.asset_type] = types.get(holding.asset_type, 0) + value
        accounts = by_account.setdefault(holding.currency, {})
        accounts[str(holding.bank_account_id)] = accounts.get(str(holding.bank_account_id), 0) + value
    for summary in summaries:
      types = by_type.setdefault(summary.currency, {})
      if summary.cash > 0:
        types["cash"] = types.get("cash", 0) + summary.cash
        accounts = by_account.setdefault(summary.currency, {})
        accounts[str(summary.bank_account_id)] = accounts.get(str(summary.bank_account_id), 0) + summary.cash
      elif summary.cash < 0:
        borrowed[summary.currency] = borrowed.get(summary.currency, 0) + summary.cash
    names = {str(s.bank_account_id): s.name for s in summaries}
    items = []
    for currency in sorted(by_type.keys() | by_account.keys() | unpriced_count.keys()):
      types = by_type.get(currency, {})
      whole = sum(types.values())
      items.append(
        CurrencyAllocation(
          currency=currency,
          total=whole,
          by_asset_type=[
            AllocationSlice(key=kind, label=label, value=types[kind], share=types[kind] / whole) for kind, label in ALLOCATION_LABELS.items() if kind in types
          ],
          by_account=_slices(by_account.get(currency, {}), names),
          borrowed=borrowed.get(currency, 0),
          unpriced=unpriced_count.get(currency, 0),
        )
      )
    return InvestmentAllocationResponse(items=items)


# In the order the web checks its chart colours for telling neighbours apart.
ALLOCATION_LABELS = {
  "stock": "Stocks",
  "mutual_fund": "Funds",
  "etf": "ETFs",
  "bond": "Bonds",
  "crypto": "Crypto",
  "real_estate": "Real estate",
  "other": "Other",
  "cash": "Cash",
}


def _by_account(rows: Sequence[tuple[UUID, date, int]]) -> dict[UUID, dict[date, int]]:
  grouped: dict[UUID, dict[date, int]] = {}
  for account_id, day, amount in rows:
    grouped.setdefault(account_id, {})[day] = amount
  return grouped


def _points(values: dict[date, int]) -> list[ValuePoint]:
  return [ValuePoint(day=day, value=values[day]) for day in sorted(values)]


def _slices(values: dict[str, int], labels: dict[str, str]) -> list[AllocationSlice]:
  whole = sum(values.values())
  return [AllocationSlice(key=key, label=labels[key], value=value, share=value / whole) for key, value in sorted(values.items(), key=lambda kv: -kv[1])]


def range_start(range_: PerformanceRange, today: date) -> date | None:
  """The day a range is measured from, at its end: a year to date starts from the last day of last year."""
  match range_:
    case "1m":
      return today - relativedelta(months=1)
    case "3m":
      return today - relativedelta(months=3)
    case "ytd":
      return date(today.year - 1, 12, 31)
    case "1y":
      return today - relativedelta(years=1)
    case "all":
      return None


def _ranges(ledger: Ledger, bank_account_id: UUID | None, currency: str, *, today: date, reason: str | None = None) -> list[PeriodReturns]:
  result = []
  for range_ in PERFORMANCE_RANGES:
    found: Returns = unavailable(reason) if reason else period_returns(ledger, start=range_start(range_, today), end=today)
    result.append(
      PeriodReturns(
        bank_account_id=bank_account_id,
        currency=currency,
        range=range_,
        start=found.start,
        end=found.end,
        start_value=found.start_value,
        end_value=found.end_value,
        net_flows=found.net_flows,
        gain=found.gain,
        time_weighted=found.time_weighted,
        time_weighted_annualized=found.annualized(found.time_weighted),
        time_weighted_unavailable=found.time_weighted_unavailable,
        money_weighted=found.money_weighted,
        money_weighted_annualized=found.annualized(found.money_weighted),
        money_weighted_unavailable=found.money_weighted_unavailable,
      )
    )
  return result


investment_service = InvestmentService()
