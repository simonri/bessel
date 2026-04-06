from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.weather_day_schema import WeatherDaySchema


T = TypeVar("T", bound="WeatherForecastResponse")


@_attrs_define
class WeatherForecastResponse:
  """
  Attributes:
      days (list[WeatherDaySchema]): 10-day weather forecast.
  """

  days: list[WeatherDaySchema]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    days = []
    for days_item_data in self.days:
      days_item = days_item_data.to_dict()
      days.append(days_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "days": days,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.weather_day_schema import WeatherDaySchema

    d = dict(src_dict)
    days = []
    _days = d.pop("days")
    for days_item_data in _days:
      days_item = WeatherDaySchema.from_dict(days_item_data)

      days.append(days_item)

    weather_forecast_response = cls(
      days=days,
    )

    weather_forecast_response.additional_properties = d
    return weather_forecast_response

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
