from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.equipment import Equipment
from ..models.muscle_category import MuscleCategory
from ..types import UNSET, Unset

T = TypeVar("T", bound="ExerciseCreate")


@_attrs_define
class ExerciseCreate:
  """
  Attributes:
      name (str):
      category (MuscleCategory):
      equipment (Equipment):
      description (None | str | Unset):
  """

  name: str
  category: MuscleCategory
  equipment: Equipment
  description: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    name = self.name

    category = self.category.value

    equipment = self.equipment.value

    description: None | str | Unset
    if isinstance(self.description, Unset):
      description = UNSET
    else:
      description = self.description

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "name": name,
        "category": category,
        "equipment": equipment,
      }
    )
    if description is not UNSET:
      field_dict["description"] = description

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    name = d.pop("name")

    category = MuscleCategory(d.pop("category"))

    equipment = Equipment(d.pop("equipment"))

    def _parse_description(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    description = _parse_description(d.pop("description", UNSET))

    exercise_create = cls(
      name=name,
      category=category,
      equipment=equipment,
      description=description,
    )

    exercise_create.additional_properties = d
    return exercise_create

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
