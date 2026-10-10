from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="TimeEntryUpdate")


@_attrs_define
class TimeEntryUpdate:
  """
  Attributes:
      time_project_id (None | str | Unset):
      start_ts (datetime.datetime | None | Unset):
      end_ts (datetime.datetime | None | Unset):
      note (None | str | Unset):
  """

  time_project_id: None | str | Unset = UNSET
  start_ts: datetime.datetime | None | Unset = UNSET
  end_ts: datetime.datetime | None | Unset = UNSET
  note: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    time_project_id: None | str | Unset
    if isinstance(self.time_project_id, Unset):
      time_project_id = UNSET
    else:
      time_project_id = self.time_project_id

    start_ts: None | str | Unset
    if isinstance(self.start_ts, Unset):
      start_ts = UNSET
    elif isinstance(self.start_ts, datetime.datetime):
      start_ts = self.start_ts.isoformat()
    else:
      start_ts = self.start_ts

    end_ts: None | str | Unset
    if isinstance(self.end_ts, Unset):
      end_ts = UNSET
    elif isinstance(self.end_ts, datetime.datetime):
      end_ts = self.end_ts.isoformat()
    else:
      end_ts = self.end_ts

    note: None | str | Unset
    if isinstance(self.note, Unset):
      note = UNSET
    else:
      note = self.note

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if time_project_id is not UNSET:
      field_dict["time_project_id"] = time_project_id
    if start_ts is not UNSET:
      field_dict["start_ts"] = start_ts
    if end_ts is not UNSET:
      field_dict["end_ts"] = end_ts
    if note is not UNSET:
      field_dict["note"] = note

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_time_project_id(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    time_project_id = _parse_time_project_id(d.pop("time_project_id", UNSET))

    def _parse_start_ts(data: object) -> datetime.datetime | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        start_ts_type_0 = datetime.datetime.fromisoformat(data)

        return start_ts_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None | Unset, data)

    start_ts = _parse_start_ts(d.pop("start_ts", UNSET))

    def _parse_end_ts(data: object) -> datetime.datetime | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        end_ts_type_0 = datetime.datetime.fromisoformat(data)

        return end_ts_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None | Unset, data)

    end_ts = _parse_end_ts(d.pop("end_ts", UNSET))

    def _parse_note(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    note = _parse_note(d.pop("note", UNSET))

    time_entry_update = cls(
      time_project_id=time_project_id,
      start_ts=start_ts,
      end_ts=end_ts,
      note=note,
    )

    time_entry_update.additional_properties = d
    return time_entry_update

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
