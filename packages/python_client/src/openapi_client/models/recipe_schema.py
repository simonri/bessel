from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.recipe_type import RecipeType

if TYPE_CHECKING:
  from ..models.recipe_body import RecipeBody


T = TypeVar("T", bound="RecipeSchema")


@_attrs_define
class RecipeSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      title (str):
      content (str):
      recipe_type (RecipeType):
      body (RecipeBody):
      structured (bool): False when `body` was derived from markdown on the fly rather than saved.
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  title: str
  content: str
  recipe_type: RecipeType
  body: RecipeBody
  structured: bool
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    title = self.title

    content = self.content

    recipe_type = self.recipe_type.value

    body = self.body.to_dict()

    structured = self.structured

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "title": title,
        "content": content,
        "recipe_type": recipe_type,
        "body": body,
        "structured": structured,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.recipe_body import RecipeBody

    d = dict(src_dict)
    created_at = datetime.datetime.fromisoformat(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = datetime.datetime.fromisoformat(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    title = d.pop("title")

    content = d.pop("content")

    recipe_type = RecipeType(d.pop("recipe_type"))

    body = RecipeBody.from_dict(d.pop("body"))

    structured = d.pop("structured")

    recipe_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      title=title,
      content=content,
      recipe_type=recipe_type,
      body=body,
      structured=structured,
    )

    recipe_schema.additional_properties = d
    return recipe_schema

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
