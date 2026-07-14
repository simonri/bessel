from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.sleep_daily_entry import SleepDailyEntry


T = TypeVar("T", bound="SleepDailyResponse")


@_attrs_define
class SleepDailyResponse:
  """
  Attributes:
      nights (list[SleepDailyEntry]):
  """

  nights: list[SleepDailyEntry]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    nights = []
    for nights_item_data in self.nights:
      nights_item = nights_item_data.to_dict()
      nights.append(nights_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "nights": nights,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.sleep_daily_entry import SleepDailyEntry

    d = dict(src_dict)
    nights = []
    _nights = d.pop("nights")
    for nights_item_data in _nights:
      nights_item = SleepDailyEntry.from_dict(nights_item_data)

      nights.append(nights_item)

    sleep_daily_response = cls(
      nights=nights,
    )

    sleep_daily_response.additional_properties = d
    return sleep_daily_response

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
