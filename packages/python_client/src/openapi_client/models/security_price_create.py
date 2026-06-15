from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="SecurityPriceCreate")


@_attrs_define
class SecurityPriceCreate:
  """
  Attributes:
      price_date (datetime.date):
      price_per_unit (int): Price in minor units (cents).
      currency (str):
  """

  price_date: datetime.date
  price_per_unit: int
  currency: str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    price_date = self.price_date.isoformat()

    price_per_unit = self.price_per_unit

    currency = self.currency

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "price_date": price_date,
        "price_per_unit": price_per_unit,
        "currency": currency,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    price_date = datetime.date.fromisoformat(d.pop("price_date"))

    price_per_unit = d.pop("price_per_unit")

    currency = d.pop("currency")

    security_price_create = cls(
      price_date=price_date,
      price_per_unit=price_per_unit,
      currency=currency,
    )

    security_price_create.additional_properties = d
    return security_price_create

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
