from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="LocationImportSchema")


@_attrs_define
class LocationImportSchema:
  """
  Attributes:
      id (UUID):
      created_at (datetime.datetime):
      filename (None | str):
      format_ (str): ios or android.
      as_of (datetime.datetime): The export's latest recorded moment.
      range_start (datetime.datetime):
      range_end (datetime.datetime):
      segments (int): Visits, trips and route stretches read from the file.
      added (int):
      updated (int):
      removed (int): Segments the phone no longer has, within the export's span.
      unchanged (int):
      stale (int): Segments skipped because a newer export already decided them.
  """

  id: UUID
  created_at: datetime.datetime
  filename: None | str
  format_: str
  as_of: datetime.datetime
  range_start: datetime.datetime
  range_end: datetime.datetime
  segments: int
  added: int
  updated: int
  removed: int
  unchanged: int
  stale: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    created_at = self.created_at.isoformat()

    filename: None | str
    filename = self.filename

    format_ = self.format_

    as_of = self.as_of.isoformat()

    range_start = self.range_start.isoformat()

    range_end = self.range_end.isoformat()

    segments = self.segments

    added = self.added

    updated = self.updated

    removed = self.removed

    unchanged = self.unchanged

    stale = self.stale

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "created_at": created_at,
        "filename": filename,
        "format": format_,
        "as_of": as_of,
        "range_start": range_start,
        "range_end": range_end,
        "segments": segments,
        "added": added,
        "updated": updated,
        "removed": removed,
        "unchanged": unchanged,
        "stale": stale,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    id = UUID(d.pop("id"))

    created_at = datetime.datetime.fromisoformat(d.pop("created_at"))

    def _parse_filename(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    filename = _parse_filename(d.pop("filename"))

    format_ = d.pop("format")

    as_of = datetime.datetime.fromisoformat(d.pop("as_of"))

    range_start = datetime.datetime.fromisoformat(d.pop("range_start"))

    range_end = datetime.datetime.fromisoformat(d.pop("range_end"))

    segments = d.pop("segments")

    added = d.pop("added")

    updated = d.pop("updated")

    removed = d.pop("removed")

    unchanged = d.pop("unchanged")

    stale = d.pop("stale")

    location_import_schema = cls(
      id=id,
      created_at=created_at,
      filename=filename,
      format_=format_,
      as_of=as_of,
      range_start=range_start,
      range_end=range_end,
      segments=segments,
      added=added,
      updated=updated,
      removed=removed,
      unchanged=unchanged,
      stale=stale,
    )

    location_import_schema.additional_properties = d
    return location_import_schema

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
