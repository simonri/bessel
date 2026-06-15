from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="SecurityPriceSchema")


@_attrs_define
class SecurityPriceSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      security_id (str):
      price_date (datetime.date):
      price_per_unit (int): Price in minor units (cents).
      currency (str):
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  security_id: str
  price_date: datetime.date
  price_per_unit: int
  currency: str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    security_id = self.security_id

    price_date = self.price_date.isoformat()

    price_per_unit = self.price_per_unit

    currency = self.currency

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "security_id": security_id,
        "price_date": price_date,
        "price_per_unit": price_per_unit,
        "currency": currency,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    created_at = datetime.datetime.fromisoformat(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = datetime.datetime.fromisoformat(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    security_id = d.pop("security_id")

    price_date = datetime.date.fromisoformat(d.pop("price_date"))

    price_per_unit = d.pop("price_per_unit")

    currency = d.pop("currency")

    security_price_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      security_id=security_id,
      price_date=price_date,
      price_per_unit=price_per_unit,
      currency=currency,
    )

    security_price_schema.additional_properties = d
    return security_price_schema

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
