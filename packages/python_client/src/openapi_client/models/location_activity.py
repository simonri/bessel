from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="LocationActivity")


@_attrs_define
class LocationActivity:
  """
  Attributes:
      id (UUID):
      start_at (datetime.datetime):
      end_at (datetime.datetime):
      utc_offset_minutes (int | None):
      activity_type (None | str): How Google thinks you moved, e.g. walking, in passenger vehicle, flying.
      distance_meters (float | None):
      start_latitude (float | None):
      start_longitude (float | None):
      end_latitude (float | None):
      end_longitude (float | None):
  """

  id: UUID
  start_at: datetime.datetime
  end_at: datetime.datetime
  utc_offset_minutes: int | None
  activity_type: None | str
  distance_meters: float | None
  start_latitude: float | None
  start_longitude: float | None
  end_latitude: float | None
  end_longitude: float | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    start_at = self.start_at.isoformat()

    end_at = self.end_at.isoformat()

    utc_offset_minutes: int | None
    utc_offset_minutes = self.utc_offset_minutes

    activity_type: None | str
    activity_type = self.activity_type

    distance_meters: float | None
    distance_meters = self.distance_meters

    start_latitude: float | None
    start_latitude = self.start_latitude

    start_longitude: float | None
    start_longitude = self.start_longitude

    end_latitude: float | None
    end_latitude = self.end_latitude

    end_longitude: float | None
    end_longitude = self.end_longitude

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "start_at": start_at,
        "end_at": end_at,
        "utc_offset_minutes": utc_offset_minutes,
        "activity_type": activity_type,
        "distance_meters": distance_meters,
        "start_latitude": start_latitude,
        "start_longitude": start_longitude,
        "end_latitude": end_latitude,
        "end_longitude": end_longitude,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    id = UUID(d.pop("id"))

    start_at = datetime.datetime.fromisoformat(d.pop("start_at"))

    end_at = datetime.datetime.fromisoformat(d.pop("end_at"))

    def _parse_utc_offset_minutes(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    utc_offset_minutes = _parse_utc_offset_minutes(d.pop("utc_offset_minutes"))

    def _parse_activity_type(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    activity_type = _parse_activity_type(d.pop("activity_type"))

    def _parse_distance_meters(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    distance_meters = _parse_distance_meters(d.pop("distance_meters"))

    def _parse_start_latitude(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    start_latitude = _parse_start_latitude(d.pop("start_latitude"))

    def _parse_start_longitude(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    start_longitude = _parse_start_longitude(d.pop("start_longitude"))

    def _parse_end_latitude(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    end_latitude = _parse_end_latitude(d.pop("end_latitude"))

    def _parse_end_longitude(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    end_longitude = _parse_end_longitude(d.pop("end_longitude"))

    location_activity = cls(
      id=id,
      start_at=start_at,
      end_at=end_at,
      utc_offset_minutes=utc_offset_minutes,
      activity_type=activity_type,
      distance_meters=distance_meters,
      start_latitude=start_latitude,
      start_longitude=start_longitude,
      end_latitude=end_latitude,
      end_longitude=end_longitude,
    )

    location_activity.additional_properties = d
    return location_activity

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
