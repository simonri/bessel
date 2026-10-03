from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.calendar_event_attendee_response import CalendarEventAttendeeResponse

T = TypeVar("T", bound="CalendarEventAttendee")


@_attrs_define
class CalendarEventAttendee:
  """
  Attributes:
      email (str):
      name (None | str):
      response (CalendarEventAttendeeResponse):
  """

  email: str
  name: None | str
  response: CalendarEventAttendeeResponse
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    email = self.email

    name: None | str
    name = self.name

    response = self.response.value

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "email": email,
        "name": name,
        "response": response,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    email = d.pop("email")

    def _parse_name(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    name = _parse_name(d.pop("name"))

    response = CalendarEventAttendeeResponse(d.pop("response"))

    calendar_event_attendee = cls(
      email=email,
      name=name,
      response=response,
    )

    calendar_event_attendee.additional_properties = d
    return calendar_event_attendee

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
