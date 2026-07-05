from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.recipe_type import RecipeType
from ..types import UNSET, Unset

T = TypeVar("T", bound="RecipeUpdate")


@_attrs_define
class RecipeUpdate:
  """
  Attributes:
      title (None | str | Unset):
      content (None | str | Unset):
      recipe_type (None | RecipeType | Unset):
  """

  title: None | str | Unset = UNSET
  content: None | str | Unset = UNSET
  recipe_type: None | RecipeType | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    title: None | str | Unset
    if isinstance(self.title, Unset):
      title = UNSET
    else:
      title = self.title

    content: None | str | Unset
    if isinstance(self.content, Unset):
      content = UNSET
    else:
      content = self.content

    recipe_type: None | str | Unset
    if isinstance(self.recipe_type, Unset):
      recipe_type = UNSET
    elif isinstance(self.recipe_type, RecipeType):
      recipe_type = self.recipe_type.value
    else:
      recipe_type = self.recipe_type

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if title is not UNSET:
      field_dict["title"] = title
    if content is not UNSET:
      field_dict["content"] = content
    if recipe_type is not UNSET:
      field_dict["recipe_type"] = recipe_type

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_title(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    title = _parse_title(d.pop("title", UNSET))

    def _parse_content(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    content = _parse_content(d.pop("content", UNSET))

    def _parse_recipe_type(data: object) -> None | RecipeType | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        recipe_type_type_0 = RecipeType(data)

        return recipe_type_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | RecipeType | Unset, data)

    recipe_type = _parse_recipe_type(d.pop("recipe_type", UNSET))

    recipe_update = cls(
      title=title,
      content=content,
      recipe_type=recipe_type,
    )

    recipe_update.additional_properties = d
    return recipe_update

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
