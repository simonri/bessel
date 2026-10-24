from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="WeatherDay")


@_attrs_define
class WeatherDay:
  """
  Attributes:
      date (datetime.date): Local day.
      temperature_min (float): °C.
      temperature_max (float): °C.
      condition (None | str): How the day looks around midday.
      precipitation (float): mm over the day.
      precipitation_probability_max (float | None): %.
      thunder_probability_max (float | None): %; only known for the first days.
      wind_speed_max (float): m/s.
      wind_gust_max (float | None): m/s.
  """

  date: datetime.date
  temperature_min: float
  temperature_max: float
  condition: None | str
  precipitation: float
  precipitation_probability_max: float | None
  thunder_probability_max: float | None
  wind_speed_max: float
  wind_gust_max: float | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    date = self.date.isoformat()

    temperature_min = self.temperature_min

    temperature_max = self.temperature_max

    condition: None | str
    condition = self.condition

    precipitation = self.precipitation

    precipitation_probability_max: float | None
    precipitation_probability_max = self.precipitation_probability_max

    thunder_probability_max: float | None
    thunder_probability_max = self.thunder_probability_max

    wind_speed_max = self.wind_speed_max

    wind_gust_max: float | None
    wind_gust_max = self.wind_gust_max

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "date": date,
        "temperature_min": temperature_min,
        "temperature_max": temperature_max,
        "condition": condition,
        "precipitation": precipitation,
        "precipitation_probability_max": precipitation_probability_max,
        "thunder_probability_max": thunder_probability_max,
        "wind_speed_max": wind_speed_max,
        "wind_gust_max": wind_gust_max,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    date = datetime.date.fromisoformat(d.pop("date"))

    temperature_min = d.pop("temperature_min")

    temperature_max = d.pop("temperature_max")

    def _parse_condition(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    condition = _parse_condition(d.pop("condition"))

    precipitation = d.pop("precipitation")

    def _parse_precipitation_probability_max(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    precipitation_probability_max = _parse_precipitation_probability_max(d.pop("precipitation_probability_max"))

    def _parse_thunder_probability_max(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    thunder_probability_max = _parse_thunder_probability_max(d.pop("thunder_probability_max"))

    wind_speed_max = d.pop("wind_speed_max")

    def _parse_wind_gust_max(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    wind_gust_max = _parse_wind_gust_max(d.pop("wind_gust_max"))

    weather_day = cls(
      date=date,
      temperature_min=temperature_min,
      temperature_max=temperature_max,
      condition=condition,
      precipitation=precipitation,
      precipitation_probability_max=precipitation_probability_max,
      thunder_probability_max=thunder_probability_max,
      wind_speed_max=wind_speed_max,
      wind_gust_max=wind_gust_max,
    )

    weather_day.additional_properties = d
    return weather_day

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
