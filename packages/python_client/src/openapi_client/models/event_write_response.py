from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.calendar_event_schema import CalendarEventSchema


T = TypeVar("T", bound="EventWriteResponse")


@_attrs_define
class EventWriteResponse:
  """
  Attributes:
      event (CalendarEventSchema | None): The written event as synced back, or null if it falls outside the synced
          window.
  """

  event: CalendarEventSchema | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.calendar_event_schema import CalendarEventSchema

    event: dict[str, Any] | None
    if isinstance(self.event, CalendarEventSchema):
      event = self.event.to_dict()
    else:
      event = self.event

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "event": event,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.calendar_event_schema import CalendarEventSchema

    d = dict(src_dict)

    def _parse_event(data: object) -> CalendarEventSchema | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        event_type_0 = CalendarEventSchema.from_dict(data)

        return event_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(CalendarEventSchema | None, data)

    event = _parse_event(d.pop("event"))

    event_write_response = cls(
      event=event,
    )

    event_write_response.additional_properties = d
    return event_write_response

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
