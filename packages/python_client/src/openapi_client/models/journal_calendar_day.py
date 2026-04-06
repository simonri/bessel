from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="JournalCalendarDay")


@_attrs_define
class JournalCalendarDay:
  """
  Attributes:
      entry_date (datetime.date):
      has_morning (bool | Unset):  Default: False.
      has_audit (bool | Unset):  Default: False.
  """

  entry_date: datetime.date
  has_morning: bool | Unset = False
  has_audit: bool | Unset = False
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    entry_date = self.entry_date.isoformat()

    has_morning = self.has_morning

    has_audit = self.has_audit

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "entry_date": entry_date,
      }
    )
    if has_morning is not UNSET:
      field_dict["has_morning"] = has_morning
    if has_audit is not UNSET:
      field_dict["has_audit"] = has_audit

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    entry_date = isoparse(d.pop("entry_date")).date()

    has_morning = d.pop("has_morning", UNSET)

    has_audit = d.pop("has_audit", UNSET)

    journal_calendar_day = cls(
      entry_date=entry_date,
      has_morning=has_morning,
      has_audit=has_audit,
    )

    journal_calendar_day.additional_properties = d
    return journal_calendar_day

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
