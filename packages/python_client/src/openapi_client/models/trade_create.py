from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.trade_type import TradeType
from ..types import UNSET, Unset

T = TypeVar("T", bound="TradeCreate")


@_attrs_define
class TradeCreate:
  """
  Attributes:
      security_id (str):
      bank_account_id (str):
      trade_type (TradeType):
      trade_date (datetime.date):
      quantity (int): Quantity in micro-units (x1,000,000).
      price_per_unit (int): Price per unit in minor units (cents).
      currency (str):
      notes (None | str | Unset):
  """

  security_id: str
  bank_account_id: str
  trade_type: TradeType
  trade_date: datetime.date
  quantity: int
  price_per_unit: int
  currency: str
  notes: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    security_id = self.security_id

    bank_account_id = self.bank_account_id

    trade_type = self.trade_type.value

    trade_date = self.trade_date.isoformat()

    quantity = self.quantity

    price_per_unit = self.price_per_unit

    currency = self.currency

    notes: None | str | Unset
    if isinstance(self.notes, Unset):
      notes = UNSET
    else:
      notes = self.notes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "security_id": security_id,
        "bank_account_id": bank_account_id,
        "trade_type": trade_type,
        "trade_date": trade_date,
        "quantity": quantity,
        "price_per_unit": price_per_unit,
        "currency": currency,
      }
    )
    if notes is not UNSET:
      field_dict["notes"] = notes

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    security_id = d.pop("security_id")

    bank_account_id = d.pop("bank_account_id")

    trade_type = TradeType(d.pop("trade_type"))

    trade_date = isoparse(d.pop("trade_date")).date()

    quantity = d.pop("quantity")

    price_per_unit = d.pop("price_per_unit")

    currency = d.pop("currency")

    def _parse_notes(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    notes = _parse_notes(d.pop("notes", UNSET))

    trade_create = cls(
      security_id=security_id,
      bank_account_id=bank_account_id,
      trade_type=trade_type,
      trade_date=trade_date,
      quantity=quantity,
      price_per_unit=price_per_unit,
      currency=currency,
      notes=notes,
    )

    trade_create.additional_properties = d
    return trade_create

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
