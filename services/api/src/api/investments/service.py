from uuid import UUID

from api.investments.repository import TradeRepository
from api.investments.schemas import HoldingSchema


class InvestmentService:
  async def holdings(self, repo: TradeRepository, user_id: UUID) -> list[HoldingSchema]:
    """Current positions valued at each security's latest recorded price."""
    holdings: list[HoldingSchema] = []
    for row in await repo.holdings_rows(user_id):
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
    return holdings


investment_service = InvestmentService()
