from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.location_import_schema import LocationImportSchema


T = TypeVar("T", bound="LocationHistorySummary")


@_attrs_define
class LocationHistorySummary:
  """
  Attributes:
      days (list[datetime.date]): Local dates with at least one visit or trip, ascending.
      last_import (LocationImportSchema | None):
      place_names (bool): Whether place names can be looked up.
  """

  days: list[datetime.date]
  last_import: LocationImportSchema | None
  place_names: bool
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.location_import_schema import LocationImportSchema

    days = []
    for days_item_data in self.days:
      days_item = days_item_data.isoformat()
      days.append(days_item)

    last_import: dict[str, Any] | None
    if isinstance(self.last_import, LocationImportSchema):
      last_import = self.last_import.to_dict()
    else:
      last_import = self.last_import

    place_names = self.place_names

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "days": days,
        "last_import": last_import,
        "place_names": place_names,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.location_import_schema import LocationImportSchema

    d = dict(src_dict)
    days = []
    _days = d.pop("days")
    for days_item_data in _days:
      days_item = datetime.date.fromisoformat(days_item_data)

      days.append(days_item)

    def _parse_last_import(data: object) -> LocationImportSchema | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        last_import_type_0 = LocationImportSchema.from_dict(data)

        return last_import_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(LocationImportSchema | None, data)

    last_import = _parse_last_import(d.pop("last_import"))

    place_names = d.pop("place_names")

    location_history_summary = cls(
      days=days,
      last_import=last_import,
      place_names=place_names,
    )

    location_history_summary.additional_properties = d
    return location_history_summary

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
