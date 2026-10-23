from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="NameAllRequest")


@_attrs_define
class NameAllRequest:
  """
  Attributes:
      description (str): Exact bank text to name, now and in later imports.
      name (str):
      replacing (None | str | Unset): A name given by hand that these transactions should give up, from the
          suggestion.
  """

  description: str
  name: str
  replacing: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    description = self.description

    name = self.name

    replacing: None | str | Unset
    if isinstance(self.replacing, Unset):
      replacing = UNSET
    else:
      replacing = self.replacing

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "description": description,
        "name": name,
      }
    )
    if replacing is not UNSET:
      field_dict["replacing"] = replacing

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    description = d.pop("description")

    name = d.pop("name")

    def _parse_replacing(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    replacing = _parse_replacing(d.pop("replacing", UNSET))

    name_all_request = cls(
      description=description,
      name=name,
      replacing=replacing,
    )

    name_all_request.additional_properties = d
    return name_all_request

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
