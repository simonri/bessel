from datetime import date

from pydantic import UUID4, Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.security import AssetType
from api.models.trade import TradeType

# --- Trades ---


class TradeSchema(IDSchema, TimestampedSchema):
  security_id: UUID4
  security_name: str
  bank_account_id: UUID4
  bank_account_name: str
  trade_type: TradeType
  trade_date: date
  quantity: int = Field(description="Quantity in micro-units (x1,000,000).")
  price_per_unit: int = Field(description="Price per unit in minor units (cents).")
  currency: str
  notes: str | None


class TradeListResponse(ListResource[TradeSchema]):
  pass


# --- Holdings ---


class HoldingSchema(Schema):
  security_id: UUID4
  security_name: str
  ticker: str | None
  asset_type: AssetType
  currency: str
  quantity: int = Field(description="Net quantity in micro-units (x1,000,000).")
  avg_cost_per_unit: int = Field(description="Average cost per unit in minor units (cents).")
  cost_basis: int = Field(description="Total cost basis in minor units (cents).")
  current_price: int | None = Field(description="Latest price per unit in minor units, or null if no price recorded.")
  current_value: int | None = Field(description="Current value in minor units, or null if no price recorded.")
  gain_loss: int | None = Field(description="Unrealized gain/loss in minor units, or null if no price.")
  gain_loss_pct: float | None = Field(description="Unrealized gain/loss percentage, or null if no price or zero cost.")


class HoldingsResponse(Schema):
  items: list[HoldingSchema]


# --- Crypto ---


class CryptoPriceSchema(Schema):
  coin_id: str
  currency: str
  price: float
  price_change_pct_24h: float | None = None
