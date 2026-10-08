from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="EventHit")


@_attrs_define
class EventHit:
  """
  Attributes:
      id (UUID):
      title (str):
      all_day (bool):
      start_at (datetime.datetime | None): Start of a timed event.
      start_date (datetime.date | None): First day of an all-day event.
  """

  id: UUID
  title: str
  all_day: bool
  start_at: datetime.datetime | None
  start_date: datetime.date | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    title = self.title

    all_day = self.all_day

    start_at: None | str
    if isinstance(self.start_at, datetime.datetime):
      start_at = self.start_at.isoformat()
    else:
      start_at = self.start_at

    start_date: None | str
    if isinstance(self.start_date, datetime.date):
      start_date = self.start_date.isoformat()
    else:
      start_date = self.start_date

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "title": title,
        "all_day": all_day,
        "start_at": start_at,
        "start_date": start_date,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    id = UUID(d.pop("id"))

    title = d.pop("title")

    all_day = d.pop("all_day")

    def _parse_start_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        start_at_type_0 = datetime.datetime.fromisoformat(data)

        return start_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    start_at = _parse_start_at(d.pop("start_at"))

    def _parse_start_date(data: object) -> datetime.date | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        start_date_type_0 = datetime.date.fromisoformat(data)

        return start_date_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.date | None, data)

    start_date = _parse_start_date(d.pop("start_date"))

    event_hit = cls(
      id=id,
      title=title,
      all_day=all_day,
      start_at=start_at,
      start_date=start_date,
    )

    event_hit.additional_properties = d
    return event_hit

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
