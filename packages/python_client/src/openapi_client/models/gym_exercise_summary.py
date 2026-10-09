from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.gym_muscle import GymMuscle

if TYPE_CHECKING:
  from ..models.gym_top_set_schema import GymTopSetSchema


T = TypeVar("T", bound="GymExerciseSummary")


@_attrs_define
class GymExerciseSummary:
  """
  Attributes:
      id (UUID):
      name (str):
      muscles (list[GymMuscle]): Muscle groups it works, in a fixed order (chest first, calves last).
      created_at (datetime.datetime):
      last_set (GymTopSetSchema | None): The most recent top set.
      best_set (GymTopSetSchema | None): The heaviest top set ever; the most recent if tied.
      recent_sets (list[GymTopSetSchema]): Up to the last 10 top sets, oldest first.
  """

  id: UUID
  name: str
  muscles: list[GymMuscle]
  created_at: datetime.datetime
  last_set: GymTopSetSchema | None
  best_set: GymTopSetSchema | None
  recent_sets: list[GymTopSetSchema]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.gym_top_set_schema import GymTopSetSchema

    id = str(self.id)

    name = self.name

    muscles = []
    for muscles_item_data in self.muscles:
      muscles_item = muscles_item_data.value
      muscles.append(muscles_item)

    created_at = self.created_at.isoformat()

    last_set: dict[str, Any] | None
    if isinstance(self.last_set, GymTopSetSchema):
      last_set = self.last_set.to_dict()
    else:
      last_set = self.last_set

    best_set: dict[str, Any] | None
    if isinstance(self.best_set, GymTopSetSchema):
      best_set = self.best_set.to_dict()
    else:
      best_set = self.best_set

    recent_sets = []
    for recent_sets_item_data in self.recent_sets:
      recent_sets_item = recent_sets_item_data.to_dict()
      recent_sets.append(recent_sets_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "name": name,
        "muscles": muscles,
        "created_at": created_at,
        "last_set": last_set,
        "best_set": best_set,
        "recent_sets": recent_sets,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.gym_top_set_schema import GymTopSetSchema

    d = dict(src_dict)
    id = UUID(d.pop("id"))

    name = d.pop("name")

    muscles = []
    _muscles = d.pop("muscles")
    for muscles_item_data in _muscles:
      muscles_item = GymMuscle(muscles_item_data)

      muscles.append(muscles_item)

    created_at = datetime.datetime.fromisoformat(d.pop("created_at"))

    def _parse_last_set(data: object) -> GymTopSetSchema | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        last_set_type_0 = GymTopSetSchema.from_dict(data)

        return last_set_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(GymTopSetSchema | None, data)

    last_set = _parse_last_set(d.pop("last_set"))

    def _parse_best_set(data: object) -> GymTopSetSchema | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        best_set_type_0 = GymTopSetSchema.from_dict(data)

        return best_set_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(GymTopSetSchema | None, data)

    best_set = _parse_best_set(d.pop("best_set"))

    recent_sets = []
    _recent_sets = d.pop("recent_sets")
    for recent_sets_item_data in _recent_sets:
      recent_sets_item = GymTopSetSchema.from_dict(recent_sets_item_data)

      recent_sets.append(recent_sets_item)

    gym_exercise_summary = cls(
      id=id,
      name=name,
      muscles=muscles,
      created_at=created_at,
      last_set=last_set,
      best_set=best_set,
      recent_sets=recent_sets,
    )

    gym_exercise_summary.additional_properties = d
    return gym_exercise_summary

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
