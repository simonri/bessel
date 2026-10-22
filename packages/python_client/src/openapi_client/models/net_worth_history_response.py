from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.net_worth_series import NetWorthSeries


T = TypeVar("T", bound="NetWorthHistoryResponse")


@_attrs_define
class NetWorthHistoryResponse:
  """
  Attributes:
      series (list[NetWorthSeries]): Per currency, personal and company accounts counted toward net worth together.
  """

  series: list[NetWorthSeries]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    series = []
    for series_item_data in self.series:
      series_item = series_item_data.to_dict()
      series.append(series_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "series": series,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.net_worth_series import NetWorthSeries

    d = dict(src_dict)
    series = []
    _series = d.pop("series")
    for series_item_data in _series:
      series_item = NetWorthSeries.from_dict(series_item_data)

      series.append(series_item)

    net_worth_history_response = cls(
      series=series,
    )

    net_worth_history_response.additional_properties = d
    return net_worth_history_response

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
