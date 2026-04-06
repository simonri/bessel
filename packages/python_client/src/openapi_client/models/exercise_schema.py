from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.equipment import Equipment
from ..models.muscle_category import MuscleCategory

T = TypeVar("T", bound="ExerciseSchema")


@_attrs_define
class ExerciseSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      name (str):
      category (MuscleCategory):
      equipment (Equipment):
      description (None | str):
      is_custom (bool):
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  name: str
  category: MuscleCategory
  equipment: Equipment
  description: None | str
  is_custom: bool
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

    category = self.category.value

    equipment = self.equipment.value

    description: None | str
    description = self.description

    is_custom = self.is_custom

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "name": name,
        "category": category,
        "equipment": equipment,
        "description": description,
        "is_custom": is_custom,
      }
    )

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

    category = MuscleCategory(d.pop("category"))

    equipment = Equipment(d.pop("equipment"))

    def _parse_description(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    description = _parse_description(d.pop("description"))

    is_custom = d.pop("is_custom")

    exercise_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      name=name,
      category=category,
      equipment=equipment,
      description=description,
      is_custom=is_custom,
    )

    exercise_schema.additional_properties = d
    return exercise_schema

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
