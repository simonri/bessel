from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="NameSuggestion")


@_attrs_define
class NameSuggestion:
  """
  Attributes:
      description (str): Bank text that would get the same name.
      count (int): How many transactions have it.
  """

  description: str
  count: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    description = self.description

    count = self.count

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "description": description,
        "count": count,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    description = d.pop("description")

    count = d.pop("count")

    name_suggestion = cls(
      description=description,
      count=count,
    )

    name_suggestion.additional_properties = d
    return name_suggestion

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
