from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="SleepStageSegment")


@_attrs_define
class SleepStageSegment:
  """
  Attributes:
      stage (str): HKCategoryValueSleepAnalysis name, e.g. 'asleepDeep'.
      start (datetime.datetime):
      end (datetime.datetime):
  """

  stage: str
  start: datetime.datetime
  end: datetime.datetime
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    stage = self.stage

    start = self.start.isoformat()

    end = self.end.isoformat()

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "stage": stage,
        "start": start,
        "end": end,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    stage = d.pop("stage")

    start = datetime.datetime.fromisoformat(d.pop("start"))

    end = datetime.datetime.fromisoformat(d.pop("end"))

    sleep_stage_segment = cls(
      stage=stage,
      start=start,
      end=end,
    )

    sleep_stage_segment.additional_properties = d
    return sleep_stage_segment

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
