from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.timeline_lane_key import TimelineLaneKey

if TYPE_CHECKING:
  from ..models.timeline_segment import TimelineSegment


T = TypeVar("T", bound="TimelineLane")


@_attrs_define
class TimelineLane:
  """
  Attributes:
      key (TimelineLaneKey):
      total_secs (int): Seconds attributed to this lane, counting overlapping segments once. Awake sleep segments are
          shown but not counted.
      segments (list[TimelineSegment]): Segments sorted by start time. Contiguous segments with the same label are
          merged.
  """

  key: TimelineLaneKey
  total_secs: int
  segments: list[TimelineSegment]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    key = self.key.value

    total_secs = self.total_secs

    segments = []
    for segments_item_data in self.segments:
      segments_item = segments_item_data.to_dict()
      segments.append(segments_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "key": key,
        "total_secs": total_secs,
        "segments": segments,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.timeline_segment import TimelineSegment

    d = dict(src_dict)
    key = TimelineLaneKey(d.pop("key"))

    total_secs = d.pop("total_secs")

    segments = []
    _segments = d.pop("segments")
    for segments_item_data in _segments:
      segments_item = TimelineSegment.from_dict(segments_item_data)

      segments.append(segments_item)

    timeline_lane = cls(
      key=key,
      total_secs=total_secs,
      segments=segments,
    )

    timeline_lane.additional_properties = d
    return timeline_lane

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
