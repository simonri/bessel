from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="RecipeCreate")


@_attrs_define
class RecipeCreate:
  """
  Attributes:
      title (str):
      content (str | Unset):  Default: ''.
  """

  title: str
  content: str | Unset = ''
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    title = self.title

    content = self.content

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "title": title,
      }
    )
    if content is not UNSET:
      field_dict["content"] = content

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    title = d.pop("title")

    content = d.pop("content", UNSET)

    recipe_create = cls(
      title=title,
      content=content,
    )

    recipe_create.additional_properties = d
    return recipe_create

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
