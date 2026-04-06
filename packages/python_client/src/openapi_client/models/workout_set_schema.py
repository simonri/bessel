from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

T = TypeVar("T", bound="WorkoutSetSchema")


@_attrs_define
class WorkoutSetSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      workout_log_id (str):
      exercise_id (str):
      set_number (int):
      reps (int):
      weight (float):
      weight_unit (str):
      rpe (int | None):
      is_pr (bool):
      notes (None | str):
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  workout_log_id: str
  exercise_id: str
  set_number: int
  reps: int
  weight: float
  weight_unit: str
  rpe: int | None
  is_pr: bool
  notes: None | str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    workout_log_id = self.workout_log_id

    exercise_id = self.exercise_id

    set_number = self.set_number

    reps = self.reps

    weight = self.weight

    weight_unit = self.weight_unit

    rpe: int | None
    rpe = self.rpe

    is_pr = self.is_pr

    notes: None | str
    notes = self.notes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "workout_log_id": workout_log_id,
        "exercise_id": exercise_id,
        "set_number": set_number,
        "reps": reps,
        "weight": weight,
        "weight_unit": weight_unit,
        "rpe": rpe,
        "is_pr": is_pr,
        "notes": notes,
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

    workout_log_id = d.pop("workout_log_id")

    exercise_id = d.pop("exercise_id")

    set_number = d.pop("set_number")

    reps = d.pop("reps")

    weight = d.pop("weight")

    weight_unit = d.pop("weight_unit")

    def _parse_rpe(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    rpe = _parse_rpe(d.pop("rpe"))

    is_pr = d.pop("is_pr")

    def _parse_notes(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    notes = _parse_notes(d.pop("notes"))

    workout_set_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      workout_log_id=workout_log_id,
      exercise_id=exercise_id,
      set_number=set_number,
      reps=reps,
      weight=weight,
      weight_unit=weight_unit,
      rpe=rpe,
      is_pr=is_pr,
      notes=notes,
    )

    workout_set_schema.additional_properties = d
    return workout_set_schema

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
