from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Row, Select, case, func, select
from sqlalchemy.orm import selectinload

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.security import Security
from api.models.security_price import SecurityPrice
from api.models.trade import Trade, TradeType


class TradeRepository(RepositoryBase[Trade], RepositoryIDMixin[Trade, UUID]):
  model = Trade

  def list_statement(self, user_id: UUID, *, security_id: UUID | None = None, bank_account_id: UUID | None = None) -> Select[Trade]:
    """The user's trades, newest first, with the security and account loaded for their names."""
    statement = (
      self.get_base_statement()
      .where(Trade.user_id == user_id)
      .options(selectinload(Trade.security), selectinload(Trade.bank_account))
      .order_by(Trade.trade_date.desc(), Trade.created_at.desc())
    )
    if security_id is not None:
      statement = statement.where(Trade.security_id == security_id)
    if bank_account_id is not None:
      statement = statement.where(Trade.bank_account_id == bank_account_id)
    return statement

  async def holdings_rows(self, user_id: UUID, *, excluding_bank_account_ids: Sequence[UUID] = ()) -> Sequence[Row]:
    """Per-security aggregation: net quantity, buy totals, and latest known price."""
    qty_expr = case(
      (Trade.trade_type == TradeType.buy, Trade.quantity),
      else_=-Trade.quantity,
    )
    trade_agg = (
      select(
        Trade.security_id,
        func.sum(qty_expr).label("net_quantity"),
        func.sum(case((Trade.trade_type == TradeType.buy, Trade.quantity), else_=0)).label("total_buy_qty"),
        func.sum(case((Trade.trade_type == TradeType.buy, Trade.quantity * Trade.price_per_unit), else_=0)).label("total_buy_cost"),
      )
      .where(Trade.user_id == user_id, Trade.bank_account_id.not_in(excluding_bank_account_ids))
      .group_by(Trade.security_id)
      .subquery()
    )

    latest_price_date = select(func.max(SecurityPrice.price_date)).where(SecurityPrice.security_id == Security.id).correlate(Security).scalar_subquery()
    latest_price = (
      select(SecurityPrice.price_per_unit)
      .where(SecurityPrice.security_id == Security.id, SecurityPrice.price_date == latest_price_date)
      .correlate(Security)
      .scalar_subquery()
    )

    statement = (
      select(
        Security.id,
        Security.name,
        Security.ticker,
        Security.asset_type,
        Security.currency,
        trade_agg.c.net_quantity,
        trade_agg.c.total_buy_qty,
        trade_agg.c.total_buy_cost,
        latest_price.label("current_price"),
      )
      .join(trade_agg, Security.id == trade_agg.c.security_id)
      .where(trade_agg.c.net_quantity > 0)
      .order_by(Security.name.asc())
    )
    result = await self.session.execute(statement)
    return result.all()
