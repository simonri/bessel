from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="ExercisePRSchema")


@_attrs_define
class ExercisePRSchema:
  """
  Attributes:
      exercise_id (str):
      exercise_name (str):
      reps (int):
      weight (float):
      weight_unit (str):
      achieved_at (datetime.datetime):
  """

  exercise_id: str
  exercise_name: str
  reps: int
  weight: float
  weight_unit: str
  achieved_at: datetime.datetime
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    exercise_id = self.exercise_id

    exercise_name = self.exercise_name

    reps = self.reps

    weight = self.weight

    weight_unit = self.weight_unit

    achieved_at = self.achieved_at.isoformat()

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "exercise_id": exercise_id,
        "exercise_name": exercise_name,
        "reps": reps,
        "weight": weight,
        "weight_unit": weight_unit,
        "achieved_at": achieved_at,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    exercise_id = d.pop("exercise_id")

    exercise_name = d.pop("exercise_name")

    reps = d.pop("reps")

    weight = d.pop("weight")

    weight_unit = d.pop("weight_unit")

    achieved_at = datetime.datetime.fromisoformat(d.pop("achieved_at"))

    exercise_pr_schema = cls(
      exercise_id=exercise_id,
      exercise_name=exercise_name,
      reps=reps,
      weight=weight,
      weight_unit=weight_unit,
      achieved_at=achieved_at,
    )

    exercise_pr_schema.additional_properties = d
    return exercise_pr_schema

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
