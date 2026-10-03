from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="LocationVisit")


@_attrs_define
class LocationVisit:
  """
  Attributes:
      id (UUID):
      start_at (datetime.datetime):
      end_at (datetime.datetime):
      utc_offset_minutes (int | None): UTC offset where the visit happened.
      place_id (None | str): Google place ID.
      name (None | str): The place's name, when it could be looked up.
      address (None | str):
      semantic_type (None | str): Google's label for the place, e.g. Home, Work, Searched Address.
      hierarchy_level (int): 0 for a top-level visit; higher for a visit inside another, like a shop in a mall.
      latitude (float | None):
      longitude (float | None):
  """

  id: UUID
  start_at: datetime.datetime
  end_at: datetime.datetime
  utc_offset_minutes: int | None
  place_id: None | str
  name: None | str
  address: None | str
  semantic_type: None | str
  hierarchy_level: int
  latitude: float | None
  longitude: float | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    start_at = self.start_at.isoformat()

    end_at = self.end_at.isoformat()

    utc_offset_minutes: int | None
    utc_offset_minutes = self.utc_offset_minutes

    place_id: None | str
    place_id = self.place_id

    name: None | str
    name = self.name

    address: None | str
    address = self.address

    semantic_type: None | str
    semantic_type = self.semantic_type

    hierarchy_level = self.hierarchy_level

    latitude: float | None
    latitude = self.latitude

    longitude: float | None
    longitude = self.longitude

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "start_at": start_at,
        "end_at": end_at,
        "utc_offset_minutes": utc_offset_minutes,
        "place_id": place_id,
        "name": name,
        "address": address,
        "semantic_type": semantic_type,
        "hierarchy_level": hierarchy_level,
        "latitude": latitude,
        "longitude": longitude,
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

    def _parse_place_id(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    place_id = _parse_place_id(d.pop("place_id"))

    def _parse_name(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    name = _parse_name(d.pop("name"))

    def _parse_address(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    address = _parse_address(d.pop("address"))

    def _parse_semantic_type(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    semantic_type = _parse_semantic_type(d.pop("semantic_type"))

    hierarchy_level = d.pop("hierarchy_level")

    def _parse_latitude(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    latitude = _parse_latitude(d.pop("latitude"))

    def _parse_longitude(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    longitude = _parse_longitude(d.pop("longitude"))

    location_visit = cls(
      id=id,
      start_at=start_at,
      end_at=end_at,
      utc_offset_minutes=utc_offset_minutes,
      place_id=place_id,
      name=name,
      address=address,
      semantic_type=semantic_type,
      hierarchy_level=hierarchy_level,
      latitude=latitude,
      longitude=longitude,
    )

    location_visit.additional_properties = d
    return location_visit

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
