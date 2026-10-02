from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.timeline_lane import TimelineLane


T = TypeVar("T", bound="TimelineResponse")


@_attrs_define
class TimelineResponse:
  """
  Attributes:
      start_ts (int):
      end_ts (int):
      source (None | str): Activity source used for the PC lane, or null if no activity has been recorded.
      tracked_secs (int): Seconds covered by at least one lane's counted segments.
      lanes (list[TimelineLane]):
  """

  start_ts: int
  end_ts: int
  source: None | str
  tracked_secs: int
  lanes: list[TimelineLane]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    start_ts = self.start_ts

    end_ts = self.end_ts

    source: None | str
    source = self.source

    tracked_secs = self.tracked_secs

    lanes = []
    for lanes_item_data in self.lanes:
      lanes_item = lanes_item_data.to_dict()
      lanes.append(lanes_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "start_ts": start_ts,
        "end_ts": end_ts,
        "source": source,
        "tracked_secs": tracked_secs,
        "lanes": lanes,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.timeline_lane import TimelineLane

    d = dict(src_dict)
    start_ts = d.pop("start_ts")

    end_ts = d.pop("end_ts")

    def _parse_source(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    source = _parse_source(d.pop("source"))

    tracked_secs = d.pop("tracked_secs")

    lanes = []
    _lanes = d.pop("lanes")
    for lanes_item_data in _lanes:
      lanes_item = TimelineLane.from_dict(lanes_item_data)

      lanes.append(lanes_item)

    timeline_response = cls(
      start_ts=start_ts,
      end_ts=end_ts,
      source=source,
      tracked_secs=tracked_secs,
      lanes=lanes,
    )

    timeline_response.additional_properties = d
    return timeline_response

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
