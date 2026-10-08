from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="HealthWeekDay")


@_attrs_define
class HealthWeekDay:
  """
  Attributes:
      date (datetime.date):
      asleep_secs (int | None):
      move_score (int | None):
      workout_minutes (float):
  """

  date: datetime.date
  asleep_secs: int | None
  move_score: int | None
  workout_minutes: float
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    date = self.date.isoformat()

    asleep_secs: int | None
    asleep_secs = self.asleep_secs

    move_score: int | None
    move_score = self.move_score

    workout_minutes = self.workout_minutes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "date": date,
        "asleep_secs": asleep_secs,
        "move_score": move_score,
        "workout_minutes": workout_minutes,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    date = datetime.date.fromisoformat(d.pop("date"))

    def _parse_asleep_secs(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    asleep_secs = _parse_asleep_secs(d.pop("asleep_secs"))

    def _parse_move_score(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    move_score = _parse_move_score(d.pop("move_score"))

    workout_minutes = d.pop("workout_minutes")

    health_week_day = cls(
      date=date,
      asleep_secs=asleep_secs,
      move_score=move_score,
      workout_minutes=workout_minutes,
    )

    health_week_day.additional_properties = d
    return health_week_day

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
