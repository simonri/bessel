from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="SummaryCategory")


@_attrs_define
class SummaryCategory:
  """
  Attributes:
      category_id (None | str): Null for spending without a category.
      name (str):
      color (str):
      total (int): Spending less refunds, in minor units.
      count (int):
  """

  category_id: None | str
  name: str
  color: str
  total: int
  count: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    category_id: None | str
    category_id = self.category_id

    name = self.name

    color = self.color

    total = self.total

    count = self.count

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "category_id": category_id,
        "name": name,
        "color": color,
        "total": total,
        "count": count,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_category_id(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    category_id = _parse_category_id(d.pop("category_id"))

    name = d.pop("name")

    color = d.pop("color")

    total = d.pop("total")

    count = d.pop("count")

    summary_category = cls(
      category_id=category_id,
      name=name,
      color=color,
      total=total,
      count=count,
    )

    summary_category.additional_properties = d
    return summary_category

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
