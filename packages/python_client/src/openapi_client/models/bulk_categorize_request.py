from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="BulkCategorizeRequest")


@_attrs_define
class BulkCategorizeRequest:
  """
  Attributes:
      description (str): Exact description to match.
      category_id (None | str): Category ID to assign.
  """

  description: str
  category_id: None | str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    description = self.description

    category_id: None | str
    category_id = self.category_id

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "description": description,
        "category_id": category_id,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    description = d.pop("description")

    def _parse_category_id(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    category_id = _parse_category_id(d.pop("category_id"))

    bulk_categorize_request = cls(
      description=description,
      category_id=category_id,
    )

    bulk_categorize_request.additional_properties = d
    return bulk_categorize_request

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
