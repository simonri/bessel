from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="WorkoutSetCreate")


@_attrs_define
class WorkoutSetCreate:
  """
  Attributes:
      exercise_id (str):
      set_number (int):
      reps (int):
      weight (float):
      weight_unit (str | Unset):  Default: 'kg'.
      rpe (int | None | Unset):
      notes (None | str | Unset):
  """

  exercise_id: str
  set_number: int
  reps: int
  weight: float
  weight_unit: str | Unset = 'kg'
  rpe: int | None | Unset = UNSET
  notes: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    exercise_id = self.exercise_id

    set_number = self.set_number

    reps = self.reps

    weight = self.weight

    weight_unit = self.weight_unit

    rpe: int | None | Unset
    if isinstance(self.rpe, Unset):
      rpe = UNSET
    else:
      rpe = self.rpe

    notes: None | str | Unset
    if isinstance(self.notes, Unset):
      notes = UNSET
    else:
      notes = self.notes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "exercise_id": exercise_id,
        "set_number": set_number,
        "reps": reps,
        "weight": weight,
      }
    )
    if weight_unit is not UNSET:
      field_dict["weight_unit"] = weight_unit
    if rpe is not UNSET:
      field_dict["rpe"] = rpe
    if notes is not UNSET:
      field_dict["notes"] = notes

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    exercise_id = d.pop("exercise_id")

    set_number = d.pop("set_number")

    reps = d.pop("reps")

    weight = d.pop("weight")

    weight_unit = d.pop("weight_unit", UNSET)

    def _parse_rpe(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    rpe = _parse_rpe(d.pop("rpe", UNSET))

    def _parse_notes(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    notes = _parse_notes(d.pop("notes", UNSET))

    workout_set_create = cls(
      exercise_id=exercise_id,
      set_number=set_number,
      reps=reps,
      weight=weight,
      weight_unit=weight_unit,
      rpe=rpe,
      notes=notes,
    )

    workout_set_create.additional_properties = d
    return workout_set_create

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
