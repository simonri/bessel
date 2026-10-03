from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.recipe_type import RecipeType

if TYPE_CHECKING:
  from ..models.recipe_body import RecipeBody


T = TypeVar("T", bound="RecipeImportResult")


@_attrs_define
class RecipeImportResult:
  """
  Attributes:
      title (str):
      recipe_type (RecipeType):
      body (RecipeBody):
  """

  title: str
  recipe_type: RecipeType
  body: RecipeBody
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    title = self.title

    recipe_type = self.recipe_type.value

    body = self.body.to_dict()

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "title": title,
        "recipe_type": recipe_type,
        "body": body,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.recipe_body import RecipeBody

    d = dict(src_dict)
    title = d.pop("title")

    recipe_type = RecipeType(d.pop("recipe_type"))

    body = RecipeBody.from_dict(d.pop("body"))

    recipe_import_result = cls(
      title=title,
      recipe_type=recipe_type,
      body=body,
    )

    recipe_import_result.additional_properties = d
    return recipe_import_result

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
