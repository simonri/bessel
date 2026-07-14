from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="SleepDailyEntry")


@_attrs_define
class SleepDailyEntry:
  """
  Attributes:
      date (str): Wake date (ISO 8601), not the bed date — a night is bucketed to the date the sleeper woke up.
      asleep_secs (int):
  """

  date: str
  asleep_secs: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    date = self.date

    asleep_secs = self.asleep_secs

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "date": date,
        "asleep_secs": asleep_secs,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    date = d.pop("date")

    asleep_secs = d.pop("asleep_secs")

    sleep_daily_entry = cls(
      date=date,
      asleep_secs=asleep_secs,
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
