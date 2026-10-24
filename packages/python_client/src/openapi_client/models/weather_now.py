from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="WeatherNow")


@_attrs_define
class WeatherNow:
  """
  Attributes:
      time (datetime.datetime): Local time of the reading.
      temperature (float): °C.
      feels_like (float | None): °C.
      condition (None | str): E.g. 'Partly cloudy' or 'Light rain showers'.
      precipitation_next_hour (float | None): mm.
      wind_speed (float): m/s.
      wind_gust (float | None): m/s.
      wind_from_direction (float): Degrees, 0 = from the north.
      humidity (float): %.
  """

  time: datetime.datetime
  temperature: float
  feels_like: float | None
  condition: None | str
  precipitation_next_hour: float | None
  wind_speed: float
  wind_gust: float | None
  wind_from_direction: float
  humidity: float
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    time = self.time.isoformat()

    temperature = self.temperature

    feels_like: float | None
    feels_like = self.feels_like

    condition: None | str
    condition = self.condition

    precipitation_next_hour: float | None
    precipitation_next_hour = self.precipitation_next_hour

    wind_speed = self.wind_speed

    wind_gust: float | None
    wind_gust = self.wind_gust

    wind_from_direction = self.wind_from_direction

    humidity = self.humidity

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "time": time,
        "temperature": temperature,
        "feels_like": feels_like,
        "condition": condition,
        "precipitation_next_hour": precipitation_next_hour,
        "wind_speed": wind_speed,
        "wind_gust": wind_gust,
        "wind_from_direction": wind_from_direction,
        "humidity": humidity,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    time = datetime.datetime.fromisoformat(d.pop("time"))

    temperature = d.pop("temperature")

    def _parse_feels_like(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    feels_like = _parse_feels_like(d.pop("feels_like"))

    def _parse_condition(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    condition = _parse_condition(d.pop("condition"))

    def _parse_precipitation_next_hour(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    precipitation_next_hour = _parse_precipitation_next_hour(d.pop("precipitation_next_hour"))

    wind_speed = d.pop("wind_speed")

    def _parse_wind_gust(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    wind_gust = _parse_wind_gust(d.pop("wind_gust"))

    wind_from_direction = d.pop("wind_from_direction")

    humidity = d.pop("humidity")

    weather_now = cls(
      time=time,
      temperature=temperature,
      feels_like=feels_like,
      condition=condition,
      precipitation_next_hour=precipitation_next_hour,
      wind_speed=wind_speed,
      wind_gust=wind_gust,
      wind_from_direction=wind_from_direction,
      humidity=humidity,
    )

    weather_now.additional_properties = d
    return weather_now

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
