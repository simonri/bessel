from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.trade_type import TradeType
from ..types import UNSET, Unset

T = TypeVar("T", bound="TradeUpdate")


@_attrs_define
class TradeUpdate:
  """
  Attributes:
      trade_type (None | TradeType | Unset):
      trade_date (datetime.date | None | Unset):
      quantity (int | None | Unset):
      price_per_unit (int | None | Unset):
      currency (None | str | Unset):
      notes (None | str | Unset):
  """

  trade_type: None | TradeType | Unset = UNSET
  trade_date: datetime.date | None | Unset = UNSET
  quantity: int | None | Unset = UNSET
  price_per_unit: int | None | Unset = UNSET
  currency: None | str | Unset = UNSET
  notes: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    trade_type: None | str | Unset
    if isinstance(self.trade_type, Unset):
      trade_type = UNSET
    elif isinstance(self.trade_type, TradeType):
      trade_type = self.trade_type.value
    else:
      trade_type = self.trade_type

    trade_date: None | str | Unset
    if isinstance(self.trade_date, Unset):
      trade_date = UNSET
    elif isinstance(self.trade_date, datetime.date):
      trade_date = self.trade_date.isoformat()
    else:
      trade_date = self.trade_date

    quantity: int | None | Unset
    if isinstance(self.quantity, Unset):
      quantity = UNSET
    else:
      quantity = self.quantity

    price_per_unit: int | None | Unset
    if isinstance(self.price_per_unit, Unset):
      price_per_unit = UNSET
    else:
      price_per_unit = self.price_per_unit

    currency: None | str | Unset
    if isinstance(self.currency, Unset):
      currency = UNSET
    else:
      currency = self.currency

    notes: None | str | Unset
    if isinstance(self.notes, Unset):
      notes = UNSET
    else:
      notes = self.notes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if trade_type is not UNSET:
      field_dict["trade_type"] = trade_type
    if trade_date is not UNSET:
      field_dict["trade_date"] = trade_date
    if quantity is not UNSET:
      field_dict["quantity"] = quantity
    if price_per_unit is not UNSET:
      field_dict["price_per_unit"] = price_per_unit
    if currency is not UNSET:
      field_dict["currency"] = currency
    if notes is not UNSET:
      field_dict["notes"] = notes

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_trade_type(data: object) -> None | TradeType | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        trade_type_type_0 = TradeType(data)

        return trade_type_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | TradeType | Unset, data)

    trade_type = _parse_trade_type(d.pop("trade_type", UNSET))

    def _parse_trade_date(data: object) -> datetime.date | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        trade_date_type_0 = datetime.date.fromisoformat(data)

        return trade_date_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.date | None | Unset, data)

    trade_date = _parse_trade_date(d.pop("trade_date", UNSET))

    def _parse_quantity(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    quantity = _parse_quantity(d.pop("quantity", UNSET))

    def _parse_price_per_unit(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    price_per_unit = _parse_price_per_unit(d.pop("price_per_unit", UNSET))

    def _parse_currency(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    currency = _parse_currency(d.pop("currency", UNSET))

    def _parse_notes(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    notes = _parse_notes(d.pop("notes", UNSET))

    trade_update = cls(
      trade_type=trade_type,
      trade_date=trade_date,
      quantity=quantity,
      price_per_unit=price_per_unit,
      currency=currency,
      notes=notes,
    )

    trade_update.additional_properties = d
    return trade_update

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
