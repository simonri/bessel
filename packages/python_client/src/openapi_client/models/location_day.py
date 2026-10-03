from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.location_activity import LocationActivity
  from ..models.location_point import LocationPoint
  from ..models.location_visit import LocationVisit


T = TypeVar("T", bound="LocationDay")


@_attrs_define
class LocationDay:
  """
  Attributes:
      date (datetime.date):
      visits (list[LocationVisit]): Visits overlapping the day, by start time.
      activities (list[LocationActivity]): Trips overlapping the day, by start time.
      path (list[LocationPoint]): Recorded route points within the day, by time.
  """

  date: datetime.date
  visits: list[LocationVisit]
  activities: list[LocationActivity]
  path: list[LocationPoint]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    date = self.date.isoformat()

    visits = []
    for visits_item_data in self.visits:
      visits_item = visits_item_data.to_dict()
      visits.append(visits_item)

    activities = []
    for activities_item_data in self.activities:
      activities_item = activities_item_data.to_dict()
      activities.append(activities_item)

    path = []
    for path_item_data in self.path:
      path_item = path_item_data.to_dict()
      path.append(path_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "date": date,
        "visits": visits,
        "activities": activities,
        "path": path,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.location_activity import LocationActivity
    from ..models.location_point import LocationPoint
    from ..models.location_visit import LocationVisit

    d = dict(src_dict)
    date = datetime.date.fromisoformat(d.pop("date"))

    visits = []
    _visits = d.pop("visits")
    for visits_item_data in _visits:
      visits_item = LocationVisit.from_dict(visits_item_data)

      visits.append(visits_item)

    activities = []
    _activities = d.pop("activities")
    for activities_item_data in _activities:
      activities_item = LocationActivity.from_dict(activities_item_data)

      activities.append(activities_item)

    path = []
    _path = d.pop("path")
    for path_item_data in _path:
      path_item = LocationPoint.from_dict(path_item_data)

      path.append(path_item)

    location_day = cls(
      date=date,
      visits=visits,
      activities=activities,
      path=path,
    )

    location_day.additional_properties = d
    return location_day

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
