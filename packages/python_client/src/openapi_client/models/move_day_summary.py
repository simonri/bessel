from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="MoveDaySummary")


@_attrs_define
class MoveDaySummary:
  """
  Attributes:
      score (int | None): Null until there's a usual to compare against.
      label (str):
      is_partial_day (bool): True for today: compared against the usual for this time of day.
      steps (int | None):
      usual_steps (int | None):
      active_energy_kcal (float | None):
      usual_active_energy_kcal (float | None):
      exercise_minutes (float | None):
      workout_count (int):
      workout_minutes (float):
  """

  score: int | None
  label: str
  is_partial_day: bool
  steps: int | None
  usual_steps: int | None
  active_energy_kcal: float | None
  usual_active_energy_kcal: float | None
  exercise_minutes: float | None
  workout_count: int
  workout_minutes: float
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    score: int | None
    score = self.score

    label = self.label

    is_partial_day = self.is_partial_day

    steps: int | None
    steps = self.steps

    usual_steps: int | None
    usual_steps = self.usual_steps

    active_energy_kcal: float | None
    active_energy_kcal = self.active_energy_kcal

    usual_active_energy_kcal: float | None
    usual_active_energy_kcal = self.usual_active_energy_kcal

    exercise_minutes: float | None
    exercise_minutes = self.exercise_minutes

    workout_count = self.workout_count

    workout_minutes = self.workout_minutes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "score": score,
        "label": label,
        "is_partial_day": is_partial_day,
        "steps": steps,
        "usual_steps": usual_steps,
        "active_energy_kcal": active_energy_kcal,
        "usual_active_energy_kcal": usual_active_energy_kcal,
        "exercise_minutes": exercise_minutes,
        "workout_count": workout_count,
        "workout_minutes": workout_minutes,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_score(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    score = _parse_score(d.pop("score"))

    label = d.pop("label")

    is_partial_day = d.pop("is_partial_day")

    def _parse_steps(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    steps = _parse_steps(d.pop("steps"))

    def _parse_usual_steps(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    usual_steps = _parse_usual_steps(d.pop("usual_steps"))

    def _parse_active_energy_kcal(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    active_energy_kcal = _parse_active_energy_kcal(d.pop("active_energy_kcal"))

    def _parse_usual_active_energy_kcal(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    usual_active_energy_kcal = _parse_usual_active_energy_kcal(d.pop("usual_active_energy_kcal"))

    def _parse_exercise_minutes(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    exercise_minutes = _parse_exercise_minutes(d.pop("exercise_minutes"))

    workout_count = d.pop("workout_count")

    workout_minutes = d.pop("workout_minutes")

    move_day_summary = cls(
      score=score,
      label=label,
      is_partial_day=is_partial_day,
      steps=steps,
      usual_steps=usual_steps,
      active_energy_kcal=active_energy_kcal,
      usual_active_energy_kcal=usual_active_energy_kcal,
      exercise_minutes=exercise_minutes,
      workout_count=workout_count,
      workout_minutes=workout_minutes,
    )

    move_day_summary.additional_properties = d
    return move_day_summary

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
