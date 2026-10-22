from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="SummaryMonth")


@_attrs_define
class SummaryMonth:
  """
  Attributes:
      year (int):
      month (int):
      income (int): Money in, in minor units: credits that aren't refunds.
      spending (int): Money out, in minor units: debits less refunds.
  """

  year: int
  month: int
  income: int
  spending: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    year = self.year

    month = self.month

    income = self.income

    spending = self.spending

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "year": year,
        "month": month,
        "income": income,
        "spending": spending,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    year = d.pop("year")

    month = d.pop("month")

    income = d.pop("income")

    spending = d.pop("spending")

    summary_month = cls(
      year=year,
      month=month,
      income=income,
      spending=spending,
    )

    summary_month.additional_properties = d
    return summary_month

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
