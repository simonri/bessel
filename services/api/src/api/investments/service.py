from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Row

from api.avanza.repository import HoldingSnapshotRepository
from api.bank_accounts.repository import BankAccountRepository
from api.investments.repository import TradeRepository
from api.investments.schemas import HoldingSchema, InvestmentAccountSummary, YearAmount
from api.models.bank_account import INVESTMENT_SUBTYPES
from api.postgres import AsyncSession
from api.transactions.repository import TransactionRepository


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

  async def accounts(self, session: AsyncSession, user_id: UUID) -> list[InvestmentAccountSummary]:
    """Each investment account: what it's worth, what was put in and what it made."""
    accounts = [a for a in await BankAccountRepository.from_session(session).list_for_user(user_id) if a.subtype in INVESTMENT_SUBTYPES]
    ids = [a.id for a in accounts]
    transactions = TransactionRepository.from_session(session)
    balances = await transactions.net_balances_by_account(ids)
    activity = await transactions.account_activity(ids)
    flows = await transactions.flows_by_type(ids)
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
          dividends=[YearAmount(year=year, amount=amount) for year, amount in sorted(by_type.get("DIVIDEND", {}).items(), reverse=True)],
          first_transaction=activity.get(account.id, (None,))[0],
        )
      )
    return summaries


investment_service = InvestmentService()
