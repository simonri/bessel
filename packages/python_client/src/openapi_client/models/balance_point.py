from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="BalancePoint")


@_attrs_define
class BalancePoint:
  """
  Attributes:
      month (datetime.date): The month's first day.
      balance (int): The balance at the end of the month, in minor units.
  """

  month: datetime.date
  balance: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    month = self.month.isoformat()

    balance = self.balance

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "month": month,
        "balance": balance,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    month = datetime.date.fromisoformat(d.pop("month"))

    balance = d.pop("balance")

    balance_point = cls(
      month=month,
      balance=balance,
    )

    balance_point.additional_properties = d
    return balance_point

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
