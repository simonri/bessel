from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="EnergyDaySummary")


@_attrs_define
class EnergyDaySummary:
  """
  Attributes:
      score (int | None): Null while still learning the usual (fewer than 5 earlier days).
      label (str):
      resting_heart_rate (float | None):
      usual_resting_heart_rate (float | None):
      hrv_ms (float | None):
      usual_hrv_ms (float | None):
  """

  score: int | None
  label: str
  resting_heart_rate: float | None
  usual_resting_heart_rate: float | None
  hrv_ms: float | None
  usual_hrv_ms: float | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    score: int | None
    score = self.score

    label = self.label

    resting_heart_rate: float | None
    resting_heart_rate = self.resting_heart_rate

    usual_resting_heart_rate: float | None
    usual_resting_heart_rate = self.usual_resting_heart_rate

    hrv_ms: float | None
    hrv_ms = self.hrv_ms

    usual_hrv_ms: float | None
    usual_hrv_ms = self.usual_hrv_ms

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "score": score,
        "label": label,
        "resting_heart_rate": resting_heart_rate,
        "usual_resting_heart_rate": usual_resting_heart_rate,
        "hrv_ms": hrv_ms,
        "usual_hrv_ms": usual_hrv_ms,
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

    def _parse_resting_heart_rate(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    resting_heart_rate = _parse_resting_heart_rate(d.pop("resting_heart_rate"))

    def _parse_usual_resting_heart_rate(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    usual_resting_heart_rate = _parse_usual_resting_heart_rate(d.pop("usual_resting_heart_rate"))

    def _parse_hrv_ms(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    hrv_ms = _parse_hrv_ms(d.pop("hrv_ms"))

    def _parse_usual_hrv_ms(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    usual_hrv_ms = _parse_usual_hrv_ms(d.pop("usual_hrv_ms"))

    energy_day_summary = cls(
      score=score,
      label=label,
      resting_heart_rate=resting_heart_rate,
      usual_resting_heart_rate=usual_resting_heart_rate,
      hrv_ms=hrv_ms,
      usual_hrv_ms=usual_hrv_ms,
    )

    energy_day_summary.additional_properties = d
    return energy_day_summary

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
