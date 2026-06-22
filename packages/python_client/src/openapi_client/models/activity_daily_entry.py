from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="ActivityDailyEntry")


@_attrs_define
class ActivityDailyEntry:
  """
  Attributes:
      date (str): ISO date string (YYYY-MM-DD).
      active_secs (int): Total active seconds for the day.
  """

  date: str
  active_secs: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    date = self.date

    active_secs = self.active_secs

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "date": date,
        "active_secs": active_secs,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    date = d.pop("date")

    active_secs = d.pop("active_secs")

    activity_daily_entry = cls(
      date=date,
      active_secs=active_secs,
    )

    activity_daily_entry.additional_properties = d
    return activity_daily_entry

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
