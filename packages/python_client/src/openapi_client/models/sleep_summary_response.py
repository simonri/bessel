from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.sleep_stage_summary import SleepStageSummary


T = TypeVar("T", bound="SleepSummaryResponse")


@_attrs_define
class SleepSummaryResponse:
  """
  Attributes:
      total_asleep_secs (int):
      stages (list[SleepStageSummary]):
  """

  total_asleep_secs: int
  stages: list[SleepStageSummary]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    total_asleep_secs = self.total_asleep_secs

    stages = []
    for stages_item_data in self.stages:
      stages_item = stages_item_data.to_dict()
      stages.append(stages_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "total_asleep_secs": total_asleep_secs,
        "stages": stages,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.sleep_stage_summary import SleepStageSummary

    d = dict(src_dict)
    total_asleep_secs = d.pop("total_asleep_secs")

    stages = []
    _stages = d.pop("stages")
    for stages_item_data in _stages:
      stages_item = SleepStageSummary.from_dict(stages_item_data)

      stages.append(stages_item)

    sleep_summary_response = cls(
      total_asleep_secs=total_asleep_secs,
      stages=stages,
    )

    sleep_summary_response.additional_properties = d
    return sleep_summary_response

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
