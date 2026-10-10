from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.time_month_total import TimeMonthTotal


T = TypeVar("T", bound="TimeSummarySchema")


@_attrs_define
class TimeSummarySchema:
  """
  Attributes:
      year (int):
      totals (list[TimeMonthTotal]):
  """

  year: int
  totals: list[TimeMonthTotal]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    year = self.year

    totals = []
    for totals_item_data in self.totals:
      totals_item = totals_item_data.to_dict()
      totals.append(totals_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "year": year,
        "totals": totals,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.time_month_total import TimeMonthTotal

    d = dict(src_dict)
    year = d.pop("year")

    totals = []
    _totals = d.pop("totals")
    for totals_item_data in _totals:
      totals_item = TimeMonthTotal.from_dict(totals_item_data)

      totals.append(totals_item)

    time_summary_schema = cls(
      year=year,
      totals=totals,
    )

    time_summary_schema.additional_properties = d
    return time_summary_schema

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
