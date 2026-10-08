from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="HealthKitDailyMetricUpload")


@_attrs_define
class HealthKitDailyMetricUpload:
  """One local day of totals and averages, computed on the device by HealthKit's
  statistics queries so overlapping iPhone and Watch samples count once.

      Attributes:
          date (datetime.date): Local calendar date the values belong to.
          steps (int | None | Unset):
          active_energy_kcal (float | None | Unset):
          exercise_minutes (float | None | Unset):
          resting_heart_rate (float | None | Unset): Beats per minute.
          hrv_ms (float | None | Unset): Heart rate variability (SDNN), milliseconds.
  """

  date: datetime.date
  steps: int | None | Unset = UNSET
  active_energy_kcal: float | None | Unset = UNSET
  exercise_minutes: float | None | Unset = UNSET
  resting_heart_rate: float | None | Unset = UNSET
  hrv_ms: float | None | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    date = self.date.isoformat()

    steps: int | None | Unset
    if isinstance(self.steps, Unset):
      steps = UNSET
    else:
      steps = self.steps

    active_energy_kcal: float | None | Unset
    if isinstance(self.active_energy_kcal, Unset):
      active_energy_kcal = UNSET
    else:
      active_energy_kcal = self.active_energy_kcal

    exercise_minutes: float | None | Unset
    if isinstance(self.exercise_minutes, Unset):
      exercise_minutes = UNSET
    else:
      exercise_minutes = self.exercise_minutes

    resting_heart_rate: float | None | Unset
    if isinstance(self.resting_heart_rate, Unset):
      resting_heart_rate = UNSET
    else:
      resting_heart_rate = self.resting_heart_rate

    hrv_ms: float | None | Unset
    if isinstance(self.hrv_ms, Unset):
      hrv_ms = UNSET
    else:
      hrv_ms = self.hrv_ms

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "date": date,
      }
    )
    if steps is not UNSET:
      field_dict["steps"] = steps
    if active_energy_kcal is not UNSET:
      field_dict["active_energy_kcal"] = active_energy_kcal
    if exercise_minutes is not UNSET:
      field_dict["exercise_minutes"] = exercise_minutes
    if resting_heart_rate is not UNSET:
      field_dict["resting_heart_rate"] = resting_heart_rate
    if hrv_ms is not UNSET:
      field_dict["hrv_ms"] = hrv_ms

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    date = datetime.date.fromisoformat(d.pop("date"))

    def _parse_steps(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    steps = _parse_steps(d.pop("steps", UNSET))

    def _parse_active_energy_kcal(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    active_energy_kcal = _parse_active_energy_kcal(d.pop("active_energy_kcal", UNSET))

    def _parse_exercise_minutes(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    exercise_minutes = _parse_exercise_minutes(d.pop("exercise_minutes", UNSET))

    def _parse_resting_heart_rate(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    resting_heart_rate = _parse_resting_heart_rate(d.pop("resting_heart_rate", UNSET))

    def _parse_hrv_ms(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    hrv_ms = _parse_hrv_ms(d.pop("hrv_ms", UNSET))

    health_kit_daily_metric_upload = cls(
      date=date,
      steps=steps,
      active_energy_kcal=active_energy_kcal,
      exercise_minutes=exercise_minutes,
      resting_heart_rate=resting_heart_rate,
      hrv_ms=hrv_ms,
    )

    health_kit_daily_metric_upload.additional_properties = d
    return health_kit_daily_metric_upload

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
