from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.gym_muscle import GymMuscle
from ..types import UNSET, Unset

T = TypeVar("T", bound="GymExerciseUpsert")


@_attrs_define
class GymExerciseUpsert:
  """
  Attributes:
      name (str): What the exercise is called, e.g. 'Bench press'.
      muscles (list[GymMuscle] | None | Unset): Muscle groups it works. Left out, an existing exercise keeps its own.
  """

  name: str
  muscles: list[GymMuscle] | None | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    name = self.name

    muscles: list[str] | None | Unset
    if isinstance(self.muscles, Unset):
      muscles = UNSET
    elif isinstance(self.muscles, list):
      muscles = []
      for muscles_type_0_item_data in self.muscles:
        muscles_type_0_item = muscles_type_0_item_data.value
        muscles.append(muscles_type_0_item)

    else:
      muscles = self.muscles

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "name": name,
      }
    )
    if muscles is not UNSET:
      field_dict["muscles"] = muscles

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    name = d.pop("name")

    def _parse_muscles(data: object) -> list[GymMuscle] | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, list):
          raise TypeError()
        muscles_type_0 = []
        _muscles_type_0 = data
        for muscles_type_0_item_data in _muscles_type_0:
          muscles_type_0_item = GymMuscle(muscles_type_0_item_data)

          muscles_type_0.append(muscles_type_0_item)

        return muscles_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(list[GymMuscle] | None | Unset, data)

    muscles = _parse_muscles(d.pop("muscles", UNSET))

    gym_exercise_upsert = cls(
      name=name,
      muscles=muscles,
    )

    gym_exercise_upsert.additional_properties = d
    return gym_exercise_upsert

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
