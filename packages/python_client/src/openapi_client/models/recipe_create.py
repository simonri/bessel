from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.recipe_type import RecipeType
from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.recipe_body import RecipeBody


T = TypeVar("T", bound="RecipeCreate")


@_attrs_define
class RecipeCreate:
  """
  Attributes:
      title (str):
      content (str | Unset):  Default: ''.
      recipe_type (RecipeType | Unset):
      body (None | RecipeBody | Unset):
  """

  title: str
  content: str | Unset = ''
  recipe_type: RecipeType | Unset = UNSET
  body: None | RecipeBody | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.recipe_body import RecipeBody

    title = self.title

    content = self.content

    recipe_type: str | Unset = UNSET
    if not isinstance(self.recipe_type, Unset):
      recipe_type = self.recipe_type.value

    body: dict[str, Any] | None | Unset
    if isinstance(self.body, Unset):
      body = UNSET
    elif isinstance(self.body, RecipeBody):
      body = self.body.to_dict()
    else:
      body = self.body

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "title": title,
      }
    )
    if content is not UNSET:
      field_dict["content"] = content
    if recipe_type is not UNSET:
      field_dict["recipe_type"] = recipe_type
    if body is not UNSET:
      field_dict["body"] = body

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.recipe_body import RecipeBody

    d = dict(src_dict)
    title = d.pop("title")

    content = d.pop("content", UNSET)

    _recipe_type = d.pop("recipe_type", UNSET)
    recipe_type: RecipeType | Unset
    if isinstance(_recipe_type, Unset):
      recipe_type = UNSET
    else:
      recipe_type = RecipeType(_recipe_type)

    def _parse_body(data: object) -> None | RecipeBody | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        body_type_0 = RecipeBody.from_dict(data)

        return body_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | RecipeBody | Unset, data)

    body = _parse_body(d.pop("body", UNSET))

    recipe_create = cls(
      title=title,
      content=content,
      recipe_type=recipe_type,
      body=body,
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
