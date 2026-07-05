from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import Row, case, func, select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.security import Security
from api.models.security_price import SecurityPrice
from api.models.trade import Trade, TradeType


class SecurityRepository(RepositoryBase[Security], RepositoryIDMixin[Security, UUID]):
  model = Security


class TradeRepository(RepositoryBase[Trade], RepositoryIDMixin[Trade, UUID]):
  model = Trade

  async def count_for_security_by_other_users(self, security_id: UUID, user_id: UUID) -> int:
    statement = select(func.count()).select_from(Trade).where(Trade.security_id == security_id, Trade.user_id.is_distinct_from(user_id))
    result = await self.session.execute(statement)
    return result.scalar_one()

  async def holdings_rows(self, user_id: UUID) -> Sequence[Row]:
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
      .where(Trade.user_id == user_id)
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


class SecurityPriceRepository(RepositoryBase[SecurityPrice], RepositoryIDMixin[SecurityPrice, UUID]):
  model = SecurityPrice
