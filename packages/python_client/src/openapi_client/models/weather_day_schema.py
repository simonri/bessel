from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="WeatherDaySchema")


@_attrs_define
class WeatherDaySchema:
  """
  Attributes:
      date (datetime.date): Date of the weather data.
      temperature_max (float): Maximum temperature in Celsius.
      temperature_min (float): Minimum temperature in Celsius.
      apparent_temperature_max (float): Maximum feels-like temperature in Celsius.
      precipitation_probability_max (int): Maximum precipitation probability in percent.
      weather_code (int): WMO weather interpretation code.
      weather_label (str): Human-readable weather condition.
  """

  date: datetime.date
  temperature_max: float
  temperature_min: float
  apparent_temperature_max: float
  precipitation_probability_max: int
  weather_code: int
  weather_label: str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    date = self.date.isoformat()

    temperature_max = self.temperature_max

    temperature_min = self.temperature_min

    apparent_temperature_max = self.apparent_temperature_max

    precipitation_probability_max = self.precipitation_probability_max

    weather_code = self.weather_code

    weather_label = self.weather_label

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "date": date,
        "temperature_max": temperature_max,
        "temperature_min": temperature_min,
        "apparent_temperature_max": apparent_temperature_max,
        "precipitation_probability_max": precipitation_probability_max,
        "weather_code": weather_code,
        "weather_label": weather_label,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    date = datetime.date.fromisoformat(d.pop("date"))

    temperature_max = d.pop("temperature_max")

    temperature_min = d.pop("temperature_min")

    apparent_temperature_max = d.pop("apparent_temperature_max")

    precipitation_probability_max = d.pop("precipitation_probability_max")

    weather_code = d.pop("weather_code")

    weather_label = d.pop("weather_label")

    weather_day_schema = cls(
      date=date,
      temperature_max=temperature_max,
      temperature_min=temperature_min,
      apparent_temperature_max=apparent_temperature_max,
      precipitation_probability_max=precipitation_probability_max,
      weather_code=weather_code,
      weather_label=weather_label,
    )

    weather_day_schema.additional_properties = d
    return weather_day_schema

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
