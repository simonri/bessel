from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="LocationPoint")


@_attrs_define
class LocationPoint:
  """
  Attributes:
      latitude (float):
      longitude (float):
      ts (int): Unix epoch seconds.
  """

  latitude: float
  longitude: float
  ts: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    latitude = self.latitude

    longitude = self.longitude

    ts = self.ts

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "latitude": latitude,
        "longitude": longitude,
        "ts": ts,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    latitude = d.pop("latitude")

    longitude = d.pop("longitude")

    ts = d.pop("ts")

    location_point = cls(
      latitude=latitude,
      longitude=longitude,
      ts=ts,
    )

    location_point.additional_properties = d
    return location_point

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
