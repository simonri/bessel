"""Every account in one view: what it holds, where its data comes from and whether that's up to date."""

from collections import defaultdict
from collections.abc import Sequence
from datetime import date, datetime, timedelta
from typing import Literal
from uuid import UUID

from dateutil.relativedelta import relativedelta

from api.avanza.repository import AvanzaConnectionRepository, HoldingSnapshotRepository
from api.avanza.service import REJECTED
from api.bank_accounts.repository import BankAccountRepository
from api.bank_accounts.schemas import AccountOverview, AccountSource, AccountsOverviewResponse, BalancePoint, BankAccountSchema, OverviewTotal
from api.klarna.repository import KlarnaPayLaterRepository
from api.models.bank_account import INVESTMENT_SUBTYPES, BankAccount
from api.open_banking.repository import BankConnectionRepository
from api.postgres import AsyncSession
from api.sync_health.service import PAY_LATER_STALE_AFTER, STALE_AFTER
from api.transactions.repository import TransactionRepository

HISTORY_MONTHS = 12
# Hand-imported accounts drift out of date silently; a month without anything new is worth a look.
MANUAL_STALE_AFTER = timedelta(days=31)
RENEW_WARNING = timedelta(days=14)


def _money(minor: int, currency: str) -> str:
  return f"{minor / 100:,.2f} {currency}"


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
        problem = connection.sync_error
        if problem is None and not linked.shared:
          problem = f"Left out of the latest {connection.bank_name} approval. Renew to include it."
        if problem is None and connection.last_synced_at and now - connection.last_synced_at > STALE_AFTER:
          problem = f"Hasn't synced since {connection.last_synced_at:%-d %b}."
        if problem is None and connection.valid_until - now < RENEW_WARNING:
          problem = f"The {connection.bank_name} approval ends {connection.valid_until:%-d %b}. Renew it to keep importing."
        if problem is None and linked.balance_drift and linked.bank_balance is not None:
          bank_says, bessel_says = _money(linked.bank_balance, linked.currency), _money(linked.bank_balance - linked.balance_drift, linked.currency)
          problem = f"{connection.bank_name} says {bank_says}, Bessel {bessel_says}."
        found[linked.bank_account_id] = (
          AccountSource(kind="bank", label=connection.bank_name, synced_at=connection.last_synced_at, problem=problem),
          linked.bank_balance,
          linked.balance_drift,
        )
    avanza = await AvanzaConnectionRepository.from_session(session).get_for_user(user_id)
    for linked in avanza.accounts if avanza else []:
      if linked.bank_account_id is None or avanza is None:
        continue
      problem = REJECTED if avanza.credentials_rejected_at else avanza.sync_error
      if problem is None and avanza.last_synced_at and now - avanza.last_synced_at > STALE_AFTER:
        problem = f"Hasn't synced since {avanza.last_synced_at:%-d %b}."
      found[linked.bank_account_id] = (
        AccountSource(kind="avanza", label="Avanza", synced_at=avanza.last_synced_at, problem=problem),
        linked.cash_balance,
        None,
      )
    for pay_later in await KlarnaPayLaterRepository.from_session(session).list_for_user(user_id):
      problem = None
      if pay_later.balance_drift:
        problem = f"Doesn't match what Klarna says is owed, {_money(pay_later.owed or 0, 'SEK')}. Import again."
      elif pay_later.last_imported_at and now - pay_later.last_imported_at > PAY_LATER_STALE_AFTER:
        problem = f"Last imported {pay_later.last_imported_at:%-d %b}. Import again from the desktop app."
      owed = -pay_later.owed if pay_later.owed is not None else None
      found[pay_later.bank_account_id] = (
        AccountSource(kind="klarna", label="Klarna pay later", synced_at=pay_later.last_imported_at, problem=problem),
        owed,
        # Owing more in Bessel than Klarna says is a lower balance than the bank's: the same sign as a bank's drift.
        pay_later.balance_drift,
      )
    for account in accounts:
      if account.id in found:
        continue
      last = activity.get(account.id, (None, None, 0))[1]
      if last is None:
        problem = "No transactions yet. Import an export, or connect the bank."
      elif now.date() - last > MANUAL_STALE_AFTER:
        problem = f"Imported by hand, nothing since {last:%-d %b %Y}. Import the latest export, or connect the bank."
      else:
        problem = None
      found[account.id] = (AccountSource(kind="manual", label="Imported by hand", synced_at=None, problem=problem), None, None)
    return found


accounts_overview = AccountsOverview()
