from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.journal_calendar_day import JournalCalendarDay


T = TypeVar("T", bound="JournalCalendarResponse")


@_attrs_define
class JournalCalendarResponse:
  """
  Attributes:
      days (list[JournalCalendarDay]):
  """

  days: list[JournalCalendarDay]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    days = []
    for days_item_data in self.days:
      days_item = days_item_data.to_dict()
      days.append(days_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "days": days,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.journal_calendar_day import JournalCalendarDay

    d = dict(src_dict)
    days = []
    _days = d.pop("days")
    for days_item_data in _days:
      days_item = JournalCalendarDay.from_dict(days_item_data)

      days.append(days_item)

    journal_calendar_response = cls(
      days=days,
    )

    journal_calendar_response.additional_properties = d
    return journal_calendar_response

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
