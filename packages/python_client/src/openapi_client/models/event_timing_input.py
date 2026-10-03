from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.event_time_input import EventTimeInput


T = TypeVar("T", bound="EventTimingInput")


@_attrs_define
class EventTimingInput:
  """
  Attributes:
      start (EventTimeInput):
      end (EventTimeInput):
      time_zone (str): IANA zone the times are in, e.g. Europe/Stockholm.
  """

  start: EventTimeInput
  end: EventTimeInput
  time_zone: str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    start = self.start.to_dict()

    end = self.end.to_dict()

    time_zone = self.time_zone

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "start": start,
        "end": end,
        "time_zone": time_zone,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.event_time_input import EventTimeInput

    d = dict(src_dict)
    start = EventTimeInput.from_dict(d.pop("start"))

    end = EventTimeInput.from_dict(d.pop("end"))

    time_zone = d.pop("time_zone")

    event_timing_input = cls(
      start=start,
      end=end,
      time_zone=time_zone,
    )

    event_timing_input.additional_properties = d
    return event_timing_input

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
