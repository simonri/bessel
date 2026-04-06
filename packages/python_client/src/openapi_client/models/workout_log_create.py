from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="WorkoutLogCreate")


@_attrs_define
class WorkoutLogCreate:
  """
  Attributes:
      started_at (datetime.datetime):
      notes (None | str | Unset):
  """

  started_at: datetime.datetime
  notes: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    started_at = self.started_at.isoformat()

    notes: None | str | Unset
    if isinstance(self.notes, Unset):
      notes = UNSET
    else:
      notes = self.notes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "started_at": started_at,
      }
    )
    if notes is not UNSET:
      field_dict["notes"] = notes

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    started_at = isoparse(d.pop("started_at"))

    def _parse_notes(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    notes = _parse_notes(d.pop("notes", UNSET))

    workout_log_create = cls(
      started_at=started_at,
      notes=notes,
    )

    workout_log_create.additional_properties = d
    return workout_log_create

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
