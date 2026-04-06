from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.asset_type import AssetType

T = TypeVar("T", bound="HoldingSchema")


@_attrs_define
class HoldingSchema:
  """
  Attributes:
      security_id (str):
      security_name (str):
      ticker (None | str):
      asset_type (AssetType):
      currency (str):
      quantity (int): Net quantity in micro-units (x1,000,000).
      avg_cost_per_unit (int): Average cost per unit in minor units (cents).
      cost_basis (int): Total cost basis in minor units (cents).
      current_price (int | None): Latest price per unit in minor units, or null if no price recorded.
      current_value (int | None): Current value in minor units, or null if no price recorded.
      gain_loss (int | None): Unrealized gain/loss in minor units, or null if no price.
      gain_loss_pct (float | None): Unrealized gain/loss percentage, or null if no price or zero cost.
  """

  security_id: str
  security_name: str
  ticker: None | str
  asset_type: AssetType
  currency: str
  quantity: int
  avg_cost_per_unit: int
  cost_basis: int
  current_price: int | None
  current_value: int | None
  gain_loss: int | None
  gain_loss_pct: float | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    security_id = self.security_id

    security_name = self.security_name

    ticker: None | str
    ticker = self.ticker

    asset_type = self.asset_type.value

    currency = self.currency

    quantity = self.quantity

    avg_cost_per_unit = self.avg_cost_per_unit

    cost_basis = self.cost_basis

    current_price: int | None
    current_price = self.current_price

    current_value: int | None
    current_value = self.current_value

    gain_loss: int | None
    gain_loss = self.gain_loss

    gain_loss_pct: float | None
    gain_loss_pct = self.gain_loss_pct

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "security_id": security_id,
        "security_name": security_name,
        "ticker": ticker,
        "asset_type": asset_type,
        "currency": currency,
        "quantity": quantity,
        "avg_cost_per_unit": avg_cost_per_unit,
        "cost_basis": cost_basis,
        "current_price": current_price,
        "current_value": current_value,
        "gain_loss": gain_loss,
        "gain_loss_pct": gain_loss_pct,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    security_id = d.pop("security_id")

    security_name = d.pop("security_name")

    def _parse_ticker(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    ticker = _parse_ticker(d.pop("ticker"))

    asset_type = AssetType(d.pop("asset_type"))

    currency = d.pop("currency")

    quantity = d.pop("quantity")

    avg_cost_per_unit = d.pop("avg_cost_per_unit")

    cost_basis = d.pop("cost_basis")

    def _parse_current_price(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    current_price = _parse_current_price(d.pop("current_price"))

    def _parse_current_value(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    current_value = _parse_current_value(d.pop("current_value"))

    def _parse_gain_loss(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    gain_loss = _parse_gain_loss(d.pop("gain_loss"))

    def _parse_gain_loss_pct(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    gain_loss_pct = _parse_gain_loss_pct(d.pop("gain_loss_pct"))

    holding_schema = cls(
      security_id=security_id,
      security_name=security_name,
      ticker=ticker,
      asset_type=asset_type,
      currency=currency,
      quantity=quantity,
      avg_cost_per_unit=avg_cost_per_unit,
      cost_basis=cost_basis,
      current_price=current_price,
      current_value=current_value,
      gain_loss=gain_loss,
      gain_loss_pct=gain_loss_pct,
    )

    holding_schema.additional_properties = d
    return holding_schema

  @property
  def additional_keys(self) -> list[str]:
    return list(self.additional_properties.keys())

  def __getitem__(self, key: str) -> Any:
    return self.additional_properties[key]

  def __setitem__(self, key: str, value: Any) -> None:
    self.additional_properties[key] = value

  def __delitem__(self, key: str) -> None:
    del self.additional_properties[key]

  def __contains__(self, key: str) -> bool:
    return key in self.additional_properties
