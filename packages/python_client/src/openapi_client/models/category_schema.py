from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="CategorySchema")


@_attrs_define
class CategorySchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      name (str): Category name.
      slug (str): URL-friendly identifier.
      color (str): Hex color code for UI display.
      excluded (bool): Whether this category is excluded from reports.
      parent_id (None | str | Unset): Parent category ID, null for top-level.
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  name: str
  slug: str
  color: str
  excluded: bool
  parent_id: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    name = self.name

    slug = self.slug

    color = self.color

    excluded = self.excluded

    parent_id: None | str | Unset
    if isinstance(self.parent_id, Unset):
      parent_id = UNSET
    else:
      parent_id = self.parent_id

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "name": name,
        "slug": slug,
        "color": color,
        "excluded": excluded,
      }
    )
    if parent_id is not UNSET:
      field_dict["parent_id"] = parent_id

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    created_at = isoparse(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = isoparse(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    name = d.pop("name")

    slug = d.pop("slug")

    color = d.pop("color")

    excluded = d.pop("excluded")

    def _parse_parent_id(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    parent_id = _parse_parent_id(d.pop("parent_id", UNSET))

    category_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      name=name,
      slug=slug,
      color=color,
      excluded=excluded,
      parent_id=parent_id,
    )

    category_schema.additional_properties = d
    return category_schema

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
