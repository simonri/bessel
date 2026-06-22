from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="CryptoPriceSchema")


@_attrs_define
class CryptoPriceSchema:
  """
  Attributes:
      coin_id (str):
      currency (str):
      price (float):
      price_change_pct_24h (float | None | Unset):
  """

  coin_id: str
  currency: str
  price: float
  price_change_pct_24h: float | None | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    coin_id = self.coin_id

    currency = self.currency

    price = self.price

    price_change_pct_24h: float | None | Unset
    if isinstance(self.price_change_pct_24h, Unset):
      price_change_pct_24h = UNSET
    else:
      price_change_pct_24h = self.price_change_pct_24h

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "coin_id": coin_id,
        "currency": currency,
        "price": price,
      }
    )
    if price_change_pct_24h is not UNSET:
      field_dict["price_change_pct_24h"] = price_change_pct_24h

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    coin_id = d.pop("coin_id")

    currency = d.pop("currency")

    price = d.pop("price")

    def _parse_price_change_pct_24h(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    price_change_pct_24h = _parse_price_change_pct_24h(d.pop("price_change_pct_24h", UNSET))

    crypto_price_schema = cls(
      coin_id=coin_id,
      currency=currency,
      price=price,
      price_change_pct_24h=price_change_pct_24h,
    )

    crypto_price_schema.additional_properties = d
    return crypto_price_schema

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
