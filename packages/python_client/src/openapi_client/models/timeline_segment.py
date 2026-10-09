from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="TimelineSegment")


@_attrs_define
class TimelineSegment:
  """
  Attributes:
      start_ts (int): Segment start (Unix epoch seconds), clipped to the window.
      end_ts (int): Segment end (Unix epoch seconds, exclusive), clipped to the window.
      label (str): What filled this span: the sleep stage for the sleep lane, the activity (e.g. 'running') for the
          workouts lane, the app class for the PC lane.
  """

  start_ts: int
  end_ts: int
  label: str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    start_ts = self.start_ts

    end_ts = self.end_ts

    label = self.label

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "start_ts": start_ts,
        "end_ts": end_ts,
        "label": label,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    start_ts = d.pop("start_ts")

    end_ts = d.pop("end_ts")

    label = d.pop("label")

    timeline_segment = cls(
      start_ts=start_ts,
      end_ts=end_ts,
      label=label,
    )

    timeline_segment.additional_properties = d
    return timeline_segment

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
