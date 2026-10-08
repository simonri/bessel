from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="SleepDaySummary")


@_attrs_define
class SleepDaySummary:
  """
  Attributes:
      score (int):
      label (str):
      asleep_secs (int):
      usual_asleep_secs (int | None): Average over up to 14 earlier nights; null with fewer than 3.
      sleep_onset (None | str): Local time (ISO 8601 with offset) the main sleep began.
      wake_time (None | str): Local time (ISO 8601 with offset) the main sleep ended.
      deep_secs (int):
      core_secs (int):
      rem_secs (int):
      awake_secs (int):
  """

  score: int
  label: str
  asleep_secs: int
  usual_asleep_secs: int | None
  sleep_onset: None | str
  wake_time: None | str
  deep_secs: int
  core_secs: int
  rem_secs: int
  awake_secs: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    score = self.score

    label = self.label

    asleep_secs = self.asleep_secs

    usual_asleep_secs: int | None
    usual_asleep_secs = self.usual_asleep_secs

    sleep_onset: None | str
    sleep_onset = self.sleep_onset

    wake_time: None | str
    wake_time = self.wake_time

    deep_secs = self.deep_secs

    core_secs = self.core_secs

    rem_secs = self.rem_secs

    awake_secs = self.awake_secs

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "score": score,
        "label": label,
        "asleep_secs": asleep_secs,
        "usual_asleep_secs": usual_asleep_secs,
        "sleep_onset": sleep_onset,
        "wake_time": wake_time,
        "deep_secs": deep_secs,
        "core_secs": core_secs,
        "rem_secs": rem_secs,
        "awake_secs": awake_secs,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    score = d.pop("score")

    label = d.pop("label")

    asleep_secs = d.pop("asleep_secs")

    def _parse_usual_asleep_secs(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    usual_asleep_secs = _parse_usual_asleep_secs(d.pop("usual_asleep_secs"))

    def _parse_sleep_onset(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    sleep_onset = _parse_sleep_onset(d.pop("sleep_onset"))

    def _parse_wake_time(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    wake_time = _parse_wake_time(d.pop("wake_time"))

    deep_secs = d.pop("deep_secs")

    core_secs = d.pop("core_secs")

    rem_secs = d.pop("rem_secs")

    awake_secs = d.pop("awake_secs")

    sleep_day_summary = cls(
      score=score,
      label=label,
      asleep_secs=asleep_secs,
      usual_asleep_secs=usual_asleep_secs,
      sleep_onset=sleep_onset,
      wake_time=wake_time,
      deep_secs=deep_secs,
      core_secs=core_secs,
      rem_secs=rem_secs,
      awake_secs=awake_secs,
    )

    sleep_day_summary.additional_properties = d
    return sleep_day_summary

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
