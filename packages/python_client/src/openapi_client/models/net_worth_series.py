from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.net_worth_point import NetWorthPoint


T = TypeVar("T", bound="NetWorthSeries")


@_attrs_define
class NetWorthSeries:
  """
  Attributes:
      currency (str):
      points (list[NetWorthPoint]): The days net worth changed, oldest first, ending today.
  """

  currency: str
  points: list[NetWorthPoint]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    currency = self.currency

    points = []
    for points_item_data in self.points:
      points_item = points_item_data.to_dict()
      points.append(points_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "currency": currency,
        "points": points,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.net_worth_point import NetWorthPoint

    d = dict(src_dict)
    currency = d.pop("currency")

    points = []
    _points = d.pop("points")
    for points_item_data in _points:
      points_item = NetWorthPoint.from_dict(points_item_data)

      points.append(points_item)

    net_worth_series = cls(
      currency=currency,
      points=points,
    )

    net_worth_series.additional_properties = d
    return net_worth_series

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
