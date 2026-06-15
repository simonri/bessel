from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="ActivityAppSummary")


@_attrs_define
class ActivityAppSummary:
  """
  Attributes:
      app_class (str): Window class / app identifier.
      active_secs (int): Total active seconds attributed to this app.
      percentage (float): Share of total active time (0–100).
  """

  app_class: str
  active_secs: int
  percentage: float
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    app_class = self.app_class

    active_secs = self.active_secs

    percentage = self.percentage

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "app_class": app_class,
        "active_secs": active_secs,
        "percentage": percentage,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    app_class = d.pop("app_class")

    active_secs = d.pop("active_secs")

    percentage = d.pop("percentage")

    activity_app_summary = cls(
      app_class=app_class,
      active_secs=active_secs,
      percentage=percentage,
    )

    activity_app_summary.additional_properties = d
    return activity_app_summary

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
