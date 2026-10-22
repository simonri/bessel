"""Every account in one view: what it holds, where its data comes from and whether that's up to date."""

from collections import defaultdict
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from typing import Literal
from uuid import UUID

from dateutil.relativedelta import relativedelta

from api.avanza.repository import AvanzaConnectionRepository, HoldingSnapshotRepository
from api.bank_accounts.repository import BankAccountRepository
from api.bank_accounts.schemas import (
  AccountOverview,
  AccountProblem,
  AccountSource,
  AccountsOverviewResponse,
  BalancePoint,
  BankAccountSchema,
  NetWorthHistoryResponse,
  NetWorthPoint,
  NetWorthSeries,
  OverviewTotal,
)
from api.klarna.repository import KlarnaPayLaterRepository
from api.models.bank_account import INVESTMENT_SUBTYPES, BankAccount
from api.open_banking.enable_banking import bank_logo
from api.open_banking.repository import BankConnectionRepository
from api.postgres import AsyncSession
from api.sync_health.service import PAY_LATER_STALE_AFTER, STALE_AFTER
from api.transactions.repository import TransactionRepository

HISTORY_MONTHS = 12
# Hand-imported accounts drift out of date silently; a month without anything new is worth a look.
MANUAL_STALE_AFTER = timedelta(days=31)
RENEW_WARNING = timedelta(days=14)
# Money moved into or out of an investment account from outside it.
DEPOSIT_TYPES = ("DEPOSIT", "WITHDRAW")
KLARNA_LOGO = bank_logo("Klarna", "SE")
# Export file formats by the bank's name in Enable Banking, for its logo.
FILE_BANKS = {"marginalen": "Marginalen Bank", "skandiabanken": "Skandia"}


type Group = Literal["cash", "investments", "credit"]


def _group(account: BankAccount) -> Group:
  if account.subtype in INVESTMENT_SUBTYPES:
    return "investments"
  return "credit" if account.subtype == "credit_card" else "cash"


def _history(base: int, monthly: list[tuple[date, int]], *, today: date) -> list[BalancePoint]:
  """Month-end balances from the first month with a transaction, for at most the last year."""
  if not monthly:
    return []
  net_by_month = dict(monthly)
  first, last = monthly[0][0], today.replace(day=1)
  points, balance, cursor = [], base, first
  while cursor <= last:
    balance += net_by_month.get(cursor, 0)
    points.append(BalancePoint(month=cursor, balance=balance))
    cursor += relativedelta(months=1)
  return points[-HISTORY_MONTHS:]


class AccountsOverview:
  async def overview(self, session: AsyncSession, user_id: UUID, *, now: datetime) -> AccountsOverviewResponse:
    accounts = await BankAccountRepository.from_session(session).list_for_user(user_id)
    ids = [a.id for a in accounts]
    transactions = TransactionRepository.from_session(session)
    balances = await transactions.net_balances_by_account(ids)
    activity = await transactions.account_activity(ids)
    monthly: dict[UUID, list[tuple[date, int]]] = defaultdict(list)
    for account_id, month, net in await transactions.monthly_net_by_account(ids):
      monthly[account_id].append((month, net))
    holdings: dict[UUID, int] = defaultdict(int)
    for row in await HoldingSnapshotRepository.from_session(session).latest_for_accounts(ids):
      holdings[row.bank_account_id] += row.value
    sources = await self._sources(session, user_id, accounts, activity, now=now)

    overviews = []
    for account in accounts:
      first, last, count = activity.get(account.id, (None, None, 0))
      source, bank_balance, drift = sources[account.id]
      overviews.append(
        AccountOverview(
          **BankAccountSchema.model_validate(account).model_dump(exclude={"current_balance"}),
          current_balance=account.base_balance + balances.get(account.id, 0),
          group=_group(account),
          source=source,
          bank_balance=bank_balance,
          balance_drift=drift,
          holdings_value=holdings[account.id] if account.subtype in INVESTMENT_SUBTYPES else None,
          first_transaction=first,
          last_transaction=last,
          transaction_count=count,
          history=_history(account.base_balance, monthly[account.id], today=now.date()),
        )
      )
    return AccountsOverviewResponse(accounts=overviews, totals=self._totals(overviews))

  def _totals(self, accounts: Sequence[AccountOverview]) -> list[OverviewTotal]:
    totals: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: {"cash": 0, "investments": 0, "debt": 0})
    for account in accounts:
      if not account.include_in_net_worth:
        continue
      total = totals[("company" if account.is_business else "personal", account.currency)]
      if account.group == "investments":
        total["investments"] += account.current_balance + (account.holdings_value or 0)
      elif account.group == "credit":
        total["debt"] += -account.current_balance
      else:
        total["cash"] += account.current_balance
    return [
      OverviewTotal(owner=owner, currency=currency, net=t["cash"] + t["investments"] - t["debt"], **t)  # type: ignore[arg-type]
      for (owner, currency), t in sorted(totals.items(), key=lambda item: (item[0][0] != "personal", item[0][1]))
    ]

  async def _sources(
    self, session: AsyncSession, user_id: UUID, accounts: Sequence[BankAccount], activity: dict[UUID, tuple[date, date, int]], *, now: datetime
  ) -> dict[UUID, tuple[AccountSource, int | None, int | None]]:
    """Where each account's data comes from, with the balance the source reported and any difference to Bessel's."""
    found: dict[UUID, tuple[AccountSource, int | None, int | None]] = {}
    for connection in await BankConnectionRepository.from_session(session).list_for_user(user_id):
      for linked in connection.accounts:
        if linked.bank_account_id is None:
          continue
        problem = None
        if connection.sync_error is not None:
          problem = AccountProblem(kind="sync_failed", detail=connection.sync_error)
        elif not linked.shared:
          problem = AccountProblem(kind="not_shared")
        elif connection.last_synced_at and now - connection.last_synced_at > STALE_AFTER:
          problem = AccountProblem(kind="stale", day=connection.last_synced_at.date())
        elif connection.valid_until - now < RENEW_WARNING:
          problem = AccountProblem(kind="renew_soon", day=connection.valid_until.date())
        elif linked.balance_drift and linked.bank_balance is not None:
          problem = AccountProblem(kind="balance_mismatch", source_balance=linked.bank_balance)
        found[linked.bank_account_id] = (
          AccountSource(
            kind="bank",
            label=connection.bank_name,
            logo=bank_logo(connection.bank_name, connection.bank_country),
            synced_at=connection.last_synced_at,
            access_until=connection.valid_until,
            problem=problem,
          ),
          linked.bank_balance,
          linked.balance_drift,
        )
    avanza = await AvanzaConnectionRepository.from_session(session).get_for_user(user_id)
    for linked in avanza.accounts if avanza else []:
      if linked.bank_account_id is None or avanza is None:
        continue
      problem = None
      if avanza.credentials_rejected_at:
        problem = AccountProblem(kind="sign_in")
      elif avanza.sync_error:
        problem = AccountProblem(kind="sync_failed", detail=avanza.sync_error)
      elif avanza.last_synced_at and now - avanza.last_synced_at > STALE_AFTER:
        problem = AccountProblem(kind="stale", day=avanza.last_synced_at.date())
      found[linked.bank_account_id] = (
        AccountSource(kind="avanza", label="Avanza", synced_at=avanza.last_synced_at, problem=problem),
        linked.cash_balance,
        None,
      )
    for pay_later in await KlarnaPayLaterRepository.from_session(session).list_for_user(user_id):
      owed = -pay_later.owed if pay_later.owed is not None else None
      problem = None
      if pay_later.balance_drift:
        problem = AccountProblem(kind="balance_mismatch", source_balance=owed)
      elif pay_later.last_imported_at and now - pay_later.last_imported_at > PAY_LATER_STALE_AFTER:
        problem = AccountProblem(kind="import_due", day=pay_later.last_imported_at.date())
      found[pay_later.bank_account_id] = (
        AccountSource(kind="klarna", label="Klarna pay later", logo=KLARNA_LOGO, synced_at=pay_later.last_imported_at, problem=problem),
        owed,
        # Owing more in Bessel than Klarna says is a lower balance than the bank's: the same sign as a bank's drift.
        pay_later.balance_drift,
      )
    import_banks = await TransactionRepository.from_session(session).latest_import_bank_by_account([a.id for a in accounts if a.id not in found])
    for account in accounts:
      if account.id in found:
        continue
      last = activity.get(account.id, (None, None, 0))[1]
      problem = None
      if last is None:
        problem = AccountProblem(kind="no_transactions")
      elif now.date() - last > MANUAL_STALE_AFTER:
        problem = AccountProblem(kind="import_due", day=last)
      import_bank = import_banks.get(account.id)
      logo = bank_logo(FILE_BANKS[import_bank], "SE") if import_bank in FILE_BANKS else None
      found[account.id] = (
        AccountSource(kind="manual", label="Imported by hand", logo=logo, synced_at=None, import_bank=import_bank, problem=problem),
        None,
        None,
      )
    return found


class NetWorthHistory:
  async def history(self, session: AsyncSession, user_id: UUID, *, today: date) -> NetWorthHistoryResponse:
    """Net worth on every day it changed, per currency, valued the way the overview's totals are.

    Investments are worth their cash plus the holdings on the latest snapshot. Before an account's first
    snapshot nothing says what its holdings were worth, so it counts what was put in.
    """
    accounts = [a for a in await BankAccountRepository.from_session(session).list_for_user(user_id) if a.include_in_net_worth]
    ids = [a.id for a in accounts]
    transactions = TransactionRepository.from_session(session)
    net = _by_account(await transactions.daily_net_by_account(ids))
    deposits = _by_account(await transactions.daily_net_by_account(ids, transaction_types=DEPOSIT_TYPES))
    holdings = _by_account(await HoldingSnapshotRepository.from_session(session).daily_values(ids))

    series = []
    for currency in sorted({a.currency for a in accounts}):
      in_currency = [a for a in accounts if a.currency == currency]
      series.append(NetWorthSeries(currency=currency, points=_walk(in_currency, net, deposits, holdings, today=today)))
    return NetWorthHistoryResponse(series=series)


def _by_account(rows: Sequence[tuple[UUID, date, int]]) -> dict[UUID, dict[date, int]]:
  grouped: dict[UUID, dict[date, int]] = defaultdict(dict)
  for account_id, day, amount in rows:
    grouped[account_id][day] = amount
  return grouped


def _walk(
  accounts: Sequence[BankAccount],
  net: dict[UUID, dict[date, int]],
  deposits: dict[UUID, dict[date, int]],
  holdings: dict[UUID, dict[date, int]],
  *,
  today: date,
) -> list[NetWorthPoint]:
  cash = {a.id: a.base_balance for a in accounts}
  put_in = {a.id: a.base_balance for a in accounts}
  held: dict[UUID, int | None] = {a.id: None for a in accounts}

  def value(account: BankAccount) -> int:
    match _group(account):
      # A pay later or card balance below zero is debt; Bessel may not have seen the payments behind a positive one.
      case "credit":
        return min(0, cash[account.id])
      case "investments" if holdings.get(account.id):
        current = held[account.id]
        return put_in[account.id] if current is None else cash[account.id] + current
      case _:
        return cash[account.id]

  values = {a.id: value(a) for a in accounts}
  total = sum(values.values())
  days = sorted({day for source in (net, deposits, holdings) for a in accounts for day in source.get(a.id, {}) if day <= today})
  points: list[NetWorthPoint] = []
  for day in days:
    for account in accounts:
      cash[account.id] += net.get(account.id, {}).get(day, 0)
      put_in[account.id] += deposits.get(account.id, {}).get(day, 0)
      if day in holdings.get(account.id, {}):
        held[account.id] = holdings[account.id][day]
      updated = value(account)
      total += updated - values[account.id]
      values[account.id] = updated
    if not points or points[-1].value != total:
      points.append(NetWorthPoint(day=day, value=total))
  if not points or points[-1].day != today:
    points.append(NetWorthPoint(day=today, value=total))
  return points


accounts_overview = AccountsOverview()
net_worth_history = NetWorthHistory()
