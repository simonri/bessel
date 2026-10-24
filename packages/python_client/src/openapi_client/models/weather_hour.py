from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="WeatherHour")


@_attrs_define
class WeatherHour:
  """
  Attributes:
      time (datetime.datetime): Local start of the hour.
      temperature (float): °C.
      condition (None | str):
      precipitation (float | None): mm during the hour.
      precipitation_probability (float | None): %.
      wind_speed (float): m/s.
  """

  time: datetime.datetime
  temperature: float
  condition: None | str
  precipitation: float | None
  precipitation_probability: float | None
  wind_speed: float
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    time = self.time.isoformat()

    temperature = self.temperature

    condition: None | str
    condition = self.condition

    precipitation: float | None
    precipitation = self.precipitation

    precipitation_probability: float | None
    precipitation_probability = self.precipitation_probability

    wind_speed = self.wind_speed

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "time": time,
        "temperature": temperature,
        "condition": condition,
        "precipitation": precipitation,
        "precipitation_probability": precipitation_probability,
        "wind_speed": wind_speed,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    time = datetime.datetime.fromisoformat(d.pop("time"))

    temperature = d.pop("temperature")

    def _parse_condition(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    condition = _parse_condition(d.pop("condition"))

    def _parse_precipitation(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    precipitation = _parse_precipitation(d.pop("precipitation"))

    def _parse_precipitation_probability(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    precipitation_probability = _parse_precipitation_probability(d.pop("precipitation_probability"))

    wind_speed = d.pop("wind_speed")

    weather_hour = cls(
      time=time,
      temperature=temperature,
      condition=condition,
      precipitation=precipitation,
      precipitation_probability=precipitation_probability,
      wind_speed=wind_speed,
    )

    weather_hour.additional_properties = d
    return weather_hour

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
