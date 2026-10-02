from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="SleepDailyEntry")


@_attrs_define
class SleepDailyEntry:
  """
  Attributes:
      date (str): Wake date (ISO 8601), not the bed date — a night is bucketed to the date the sleeper woke up.
      asleep_secs (int):
      sleep_onset (None | str | Unset): Local time (ISO 8601 with UTC offset) the night's longest unbroken sleep
          episode began. Null if no asleep segments were recorded.
      wake_time (None | str | Unset): Local time (ISO 8601 with UTC offset) the night's longest unbroken sleep episode
          ended. Null if no asleep segments were recorded.
  """

  date: str
  asleep_secs: int
  sleep_onset: None | str | Unset = UNSET
  wake_time: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    date = self.date

    asleep_secs = self.asleep_secs

    sleep_onset: None | str | Unset
    if isinstance(self.sleep_onset, Unset):
      sleep_onset = UNSET
    else:
      sleep_onset = self.sleep_onset

    wake_time: None | str | Unset
    if isinstance(self.wake_time, Unset):
      wake_time = UNSET
    else:
      wake_time = self.wake_time

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "date": date,
        "asleep_secs": asleep_secs,
      }
    )
    if sleep_onset is not UNSET:
      field_dict["sleep_onset"] = sleep_onset
    if wake_time is not UNSET:
      field_dict["wake_time"] = wake_time

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    date = d.pop("date")

    asleep_secs = d.pop("asleep_secs")

    def _parse_sleep_onset(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    sleep_onset = _parse_sleep_onset(d.pop("sleep_onset", UNSET))

    def _parse_wake_time(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    wake_time = _parse_wake_time(d.pop("wake_time", UNSET))

    sleep_daily_entry = cls(
      date=date,
      asleep_secs=asleep_secs,
      sleep_onset=sleep_onset,
      wake_time=wake_time,
    )

    sleep_daily_entry.additional_properties = d
    return sleep_daily_entry

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
