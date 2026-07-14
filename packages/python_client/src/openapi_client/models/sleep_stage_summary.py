from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="SleepStageSummary")


@_attrs_define
class SleepStageSummary:
  """
  Attributes:
      stage (str): HKCategoryValueSleepAnalysis name, e.g. 'asleepCore', 'awake'.
      secs (int):
      percentage (float): Share of the total queried window (all stages), not just asleep time.
  """

  stage: str
  secs: int
  percentage: float
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    stage = self.stage

    secs = self.secs

    percentage = self.percentage

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "stage": stage,
        "secs": secs,
        "percentage": percentage,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    stage = d.pop("stage")

    secs = d.pop("secs")

    percentage = d.pop("percentage")

    sleep_stage_summary = cls(
      stage=stage,
      secs=secs,
      percentage=percentage,
    )

    sleep_stage_summary.additional_properties = d
    return sleep_stage_summary

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
