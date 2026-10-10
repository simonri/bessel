from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="TimeEntrySchema")


@_attrs_define
class TimeEntrySchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      time_project_id (str):
      start_ts (datetime.datetime):
      end_ts (datetime.datetime):
      note (None | str):
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  time_project_id: str
  start_ts: datetime.datetime
  end_ts: datetime.datetime
  note: None | str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    time_project_id = self.time_project_id

    start_ts = self.start_ts.isoformat()

    end_ts = self.end_ts.isoformat()

    note: None | str
    note = self.note

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "time_project_id": time_project_id,
        "start_ts": start_ts,
        "end_ts": end_ts,
        "note": note,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    created_at = datetime.datetime.fromisoformat(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = datetime.datetime.fromisoformat(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    time_project_id = d.pop("time_project_id")

    start_ts = datetime.datetime.fromisoformat(d.pop("start_ts"))

    end_ts = datetime.datetime.fromisoformat(d.pop("end_ts"))

    def _parse_note(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    note = _parse_note(d.pop("note"))

    time_entry_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      time_project_id=time_project_id,
      start_ts=start_ts,
      end_ts=end_ts,
      note=note,
    )

    time_entry_schema.additional_properties = d
    return time_entry_schema

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
