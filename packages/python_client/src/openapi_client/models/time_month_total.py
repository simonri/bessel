from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="TimeMonthTotal")


@_attrs_define
class TimeMonthTotal:
  """
  Attributes:
      time_project_id (str):
      month (int):
      seconds (int):
  """

  time_project_id: str
  month: int
  seconds: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    time_project_id = self.time_project_id

    month = self.month

    seconds = self.seconds

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "time_project_id": time_project_id,
        "month": month,
        "seconds": seconds,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    time_project_id = d.pop("time_project_id")

    month = d.pop("month")

    seconds = d.pop("seconds")

    time_month_total = cls(
      time_project_id=time_project_id,
      month=month,
      seconds=seconds,
    )

    time_month_total.additional_properties = d
    return time_month_total

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
