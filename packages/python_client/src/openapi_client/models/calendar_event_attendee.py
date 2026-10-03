from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.calendar_event_attendee_response import CalendarEventAttendeeResponse
from ..types import UNSET, Unset

T = TypeVar("T", bound="CalendarEventAttendee")


@_attrs_define
class CalendarEventAttendee:
  """
  Attributes:
      email (str):
      name (None | str):
      response (CalendarEventAttendeeResponse):
      is_self (bool | Unset): This is the account itself. Default: False.
      is_organizer (bool | Unset): This guest organizes the event. Default: False.
      photo_url (None | str | Unset): Profile photo from the account's contacts or directory.
  """

  email: str
  name: None | str
  response: CalendarEventAttendeeResponse
  is_self: bool | Unset = False
  is_organizer: bool | Unset = False
  photo_url: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    email = self.email

    name: None | str
    name = self.name

    response = self.response.value

    is_self = self.is_self

    is_organizer = self.is_organizer

    photo_url: None | str | Unset
    if isinstance(self.photo_url, Unset):
      photo_url = UNSET
    else:
      photo_url = self.photo_url

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "email": email,
        "name": name,
        "response": response,
      }
    )
    if is_self is not UNSET:
      field_dict["is_self"] = is_self
    if is_organizer is not UNSET:
      field_dict["is_organizer"] = is_organizer
    if photo_url is not UNSET:
      field_dict["photo_url"] = photo_url

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

    is_self = d.pop("is_self", UNSET)

    is_organizer = d.pop("is_organizer", UNSET)

    def _parse_photo_url(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    photo_url = _parse_photo_url(d.pop("photo_url", UNSET))

    calendar_event_attendee = cls(
      email=email,
      name=name,
      response=response,
      is_self=is_self,
      is_organizer=is_organizer,
      photo_url=photo_url,
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
