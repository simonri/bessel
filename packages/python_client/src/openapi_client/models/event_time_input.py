from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="EventTimeInput")


@_attrs_define
class EventTimeInput:
  """
  Attributes:
      date (None | str | Unset): All-day events: the calendar date, YYYY-MM-DD.
      date_time (None | str | Unset): Timed events: local wall-clock time without an offset, YYYY-MM-DDTHH:MM.
  """

  date: None | str | Unset = UNSET
  date_time: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    date: None | str | Unset
    if isinstance(self.date, Unset):
      date = UNSET
    else:
      date = self.date

    date_time: None | str | Unset
    if isinstance(self.date_time, Unset):
      date_time = UNSET
    else:
      date_time = self.date_time

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if date is not UNSET:
      field_dict["date"] = date
    if date_time is not UNSET:
      field_dict["date_time"] = date_time

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_date(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    date = _parse_date(d.pop("date", UNSET))

    def _parse_date_time(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    date_time = _parse_date_time(d.pop("date_time", UNSET))

    event_time_input = cls(
      date=date,
      date_time=date_time,
    )

    event_time_input.additional_properties = d
    return event_time_input

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
