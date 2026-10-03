from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.recurrence_schema_by_weekday_item import RecurrenceSchemaByWeekdayItem
from ..models.recurrence_schema_frequency import RecurrenceSchemaFrequency
from ..types import UNSET, Unset

T = TypeVar("T", bound="RecurrenceSchema")


@_attrs_define
class RecurrenceSchema:
  """
  Attributes:
      frequency (RecurrenceSchemaFrequency):
      interval (int | Unset):  Default: 1.
      by_weekday (list[RecurrenceSchemaByWeekdayItem] | Unset): Weekly rules only; empty means the start date's
          weekday.
      count (int | None | Unset): Number of occurrences. Mutually exclusive with `until`.
      until (None | str | Unset): Last day that may hold an occurrence (inclusive), YYYY-MM-DD.
  """

  frequency: RecurrenceSchemaFrequency
  interval: int | Unset = 1
  by_weekday: list[RecurrenceSchemaByWeekdayItem] | Unset = UNSET
  count: int | None | Unset = UNSET
  until: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    frequency = self.frequency.value

    interval = self.interval

    by_weekday: list[str] | Unset = UNSET
    if not isinstance(self.by_weekday, Unset):
      by_weekday = []
      for by_weekday_item_data in self.by_weekday:
        by_weekday_item = by_weekday_item_data.value
        by_weekday.append(by_weekday_item)

    count: int | None | Unset
    if isinstance(self.count, Unset):
      count = UNSET
    else:
      count = self.count

    until: None | str | Unset
    if isinstance(self.until, Unset):
      until = UNSET
    else:
      until = self.until

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "frequency": frequency,
      }
    )
    if interval is not UNSET:
      field_dict["interval"] = interval
    if by_weekday is not UNSET:
      field_dict["by_weekday"] = by_weekday
    if count is not UNSET:
      field_dict["count"] = count
    if until is not UNSET:
      field_dict["until"] = until

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    frequency = RecurrenceSchemaFrequency(d.pop("frequency"))

    interval = d.pop("interval", UNSET)

    _by_weekday = d.pop("by_weekday", UNSET)
    by_weekday: list[RecurrenceSchemaByWeekdayItem] | Unset = UNSET
    if _by_weekday is not UNSET:
      by_weekday = []
      for by_weekday_item_data in _by_weekday:
        by_weekday_item = RecurrenceSchemaByWeekdayItem(by_weekday_item_data)

        by_weekday.append(by_weekday_item)

    def _parse_count(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    count = _parse_count(d.pop("count", UNSET))

    def _parse_until(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    until = _parse_until(d.pop("until", UNSET))

    recurrence_schema = cls(
      frequency=frequency,
      interval=interval,
      by_weekday=by_weekday,
      count=count,
      until=until,
    )

    recurrence_schema.additional_properties = d
    return recurrence_schema

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
