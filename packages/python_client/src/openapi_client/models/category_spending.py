from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="CategorySpending")


@_attrs_define
class CategorySpending:
  """
  Attributes:
      category_id (str): Category ID.
      category_name (str): Category name.
      category_color (str): Category hex color.
      total (int): Total spending in minor units (cents).
  """

  category_id: str
  category_name: str
  category_color: str
  total: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    category_id = self.category_id

    category_name = self.category_name

    category_color = self.category_color

    total = self.total

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "category_id": category_id,
        "category_name": category_name,
        "category_color": category_color,
        "total": total,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    category_id = d.pop("category_id")

    category_name = d.pop("category_name")

    category_color = d.pop("category_color")

    total = d.pop("total")

    category_spending = cls(
      category_id=category_id,
      category_name=category_name,
      category_color=category_color,
      total=total,
    )

    category_spending.additional_properties = d
    return category_spending

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
