from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.weather_day import WeatherDay
  from ..models.weather_hour import WeatherHour
  from ..models.weather_now import WeatherNow


T = TypeVar("T", bound="WeatherForecast")


@_attrs_define
class WeatherForecast:
  """
  Attributes:
      location (None | str): The place the forecast is for, as found from the name given.
      latitude (float):
      longitude (float):
      timezone (str):
      updated_at (datetime.datetime): When Yr last updated this forecast.
      now (WeatherNow):
      hours (list[WeatherHour]): The next hours, one by one.
      days (list[WeatherDay]): Day by day, starting today.
      attribution (str | Unset):  Default: 'Weather data from MET Norway (yr.no), CC BY 4.0. Place lookup ©
          OpenStreetMap contributors.'.
  """

  location: None | str
  latitude: float
  longitude: float
  timezone: str
  updated_at: datetime.datetime
  now: WeatherNow
  hours: list[WeatherHour]
  days: list[WeatherDay]
  attribution: str | Unset = 'Weather data from MET Norway (yr.no), CC BY 4.0. Place lookup © OpenStreetMap contributors.'
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    location: None | str
    location = self.location

    latitude = self.latitude

    longitude = self.longitude

    timezone = self.timezone

    updated_at = self.updated_at.isoformat()

    now = self.now.to_dict()

    hours = []
    for hours_item_data in self.hours:
      hours_item = hours_item_data.to_dict()
      hours.append(hours_item)

    days = []
    for days_item_data in self.days:
      days_item = days_item_data.to_dict()
      days.append(days_item)

    attribution = self.attribution

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "location": location,
        "latitude": latitude,
        "longitude": longitude,
        "timezone": timezone,
        "updated_at": updated_at,
        "now": now,
        "hours": hours,
        "days": days,
      }
    )
    if attribution is not UNSET:
      field_dict["attribution"] = attribution

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.weather_day import WeatherDay
    from ..models.weather_hour import WeatherHour
    from ..models.weather_now import WeatherNow

    d = dict(src_dict)

    def _parse_location(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    location = _parse_location(d.pop("location"))

    latitude = d.pop("latitude")

    longitude = d.pop("longitude")

    timezone = d.pop("timezone")

    updated_at = datetime.datetime.fromisoformat(d.pop("updated_at"))

    now = WeatherNow.from_dict(d.pop("now"))

    hours = []
    _hours = d.pop("hours")
    for hours_item_data in _hours:
      hours_item = WeatherHour.from_dict(hours_item_data)

      hours.append(hours_item)

    days = []
    _days = d.pop("days")
    for days_item_data in _days:
      days_item = WeatherDay.from_dict(days_item_data)

      days.append(days_item)

    attribution = d.pop("attribution", UNSET)

    weather_forecast = cls(
      location=location,
      latitude=latitude,
      longitude=longitude,
      timezone=timezone,
      updated_at=updated_at,
      now=now,
      hours=hours,
      days=days,
      attribution=attribution,
    )

    weather_forecast.additional_properties = d
    return weather_forecast

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
