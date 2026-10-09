from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.gym_exercise_summary import GymExerciseSummary


T = TypeVar("T", bound="GymExerciseListResponse")


@_attrs_define
class GymExerciseListResponse:
  """
  Attributes:
      exercises (list[GymExerciseSummary]): Most recently trained first; new exercises count from when they were
          added.
  """

  exercises: list[GymExerciseSummary]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    exercises = []
    for exercises_item_data in self.exercises:
      exercises_item = exercises_item_data.to_dict()
      exercises.append(exercises_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "exercises": exercises,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.gym_exercise_summary import GymExerciseSummary

    d = dict(src_dict)
    exercises = []
    _exercises = d.pop("exercises")
    for exercises_item_data in _exercises:
      exercises_item = GymExerciseSummary.from_dict(exercises_item_data)

      exercises.append(exercises_item)

    gym_exercise_list_response = cls(
      exercises=exercises,
    )

    gym_exercise_list_response.additional_properties = d
    return gym_exercise_list_response

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
