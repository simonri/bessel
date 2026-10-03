from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.calendar_event_schema_my_response_type_0 import CalendarEventSchemaMyResponseType0
from ..models.calendar_event_schema_visibility_type_0 import CalendarEventSchemaVisibilityType0
from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.calendar_event_attendee import CalendarEventAttendee
  from ..models.recurrence_schema import RecurrenceSchema


T = TypeVar("T", bound="CalendarEventSchema")


@_attrs_define
class CalendarEventSchema:
  """
  Attributes:
      id (UUID):
      calendar_id (UUID):
      title (str):
      location (None | str):
      all_day (bool):
      start_at (datetime.datetime | None): Timed events only.
      end_at (datetime.datetime | None): Timed events only.
      start_date (datetime.date | None): All-day events only.
      end_date (datetime.date | None): All-day events only; exclusive.
      description (None | str): Plain text; never HTML.
      creator_name (None | str):
      creator_email (None | str):
      attendees (list[CalendarEventAttendee]):
      conference_url (None | str): Video meeting link, if any.
      html_link (None | str): Event page in the provider's own UI (Google only).
      busy (bool): False when the event is marked free/transparent.
      recurring (bool):
      editable (bool): False for invitations organized by someone else and provider-managed events.
      visibility (CalendarEventSchemaVisibilityType0 | None): Null means the calendar's default.
      my_response (CalendarEventSchemaMyResponseType0 | None | Unset): The account's own reply when it's a guest; null
          when not invited.
      rule (None | str | Unset): The series' RRULE value, if it repeats.
      recurrence (None | RecurrenceSchema | Unset): `rule` in structured form; null when not repeating or not
          representable.
  """

  id: UUID
  calendar_id: UUID
  title: str
  location: None | str
  all_day: bool
  start_at: datetime.datetime | None
  end_at: datetime.datetime | None
  start_date: datetime.date | None
  end_date: datetime.date | None
  description: None | str
  creator_name: None | str
  creator_email: None | str
  attendees: list[CalendarEventAttendee]
  conference_url: None | str
  html_link: None | str
  busy: bool
  recurring: bool
  editable: bool
  visibility: CalendarEventSchemaVisibilityType0 | None
  my_response: CalendarEventSchemaMyResponseType0 | None | Unset = UNSET
  rule: None | str | Unset = UNSET
  recurrence: None | RecurrenceSchema | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.recurrence_schema import RecurrenceSchema

    id = str(self.id)

    calendar_id = str(self.calendar_id)

    title = self.title

    location: None | str
    location = self.location

    all_day = self.all_day

    start_at: None | str
    if isinstance(self.start_at, datetime.datetime):
      start_at = self.start_at.isoformat()
    else:
      start_at = self.start_at

    end_at: None | str
    if isinstance(self.end_at, datetime.datetime):
      end_at = self.end_at.isoformat()
    else:
      end_at = self.end_at

    start_date: None | str
    if isinstance(self.start_date, datetime.date):
      start_date = self.start_date.isoformat()
    else:
      start_date = self.start_date

    end_date: None | str
    if isinstance(self.end_date, datetime.date):
      end_date = self.end_date.isoformat()
    else:
      end_date = self.end_date

    description: None | str
    description = self.description

    creator_name: None | str
    creator_name = self.creator_name

    creator_email: None | str
    creator_email = self.creator_email

    attendees = []
    for attendees_item_data in self.attendees:
      attendees_item = attendees_item_data.to_dict()
      attendees.append(attendees_item)

    conference_url: None | str
    conference_url = self.conference_url

    html_link: None | str
    html_link = self.html_link

    busy = self.busy

    recurring = self.recurring

    editable = self.editable

    visibility: None | str
    if isinstance(self.visibility, CalendarEventSchemaVisibilityType0):
      visibility = self.visibility.value
    else:
      visibility = self.visibility

    my_response: None | str | Unset
    if isinstance(self.my_response, Unset):
      my_response = UNSET
    elif isinstance(self.my_response, CalendarEventSchemaMyResponseType0):
      my_response = self.my_response.value
    else:
      my_response = self.my_response

    rule: None | str | Unset
    if isinstance(self.rule, Unset):
      rule = UNSET
    else:
      rule = self.rule

    recurrence: dict[str, Any] | None | Unset
    if isinstance(self.recurrence, Unset):
      recurrence = UNSET
    elif isinstance(self.recurrence, RecurrenceSchema):
      recurrence = self.recurrence.to_dict()
    else:
      recurrence = self.recurrence

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "calendar_id": calendar_id,
        "title": title,
        "location": location,
        "all_day": all_day,
        "start_at": start_at,
        "end_at": end_at,
        "start_date": start_date,
        "end_date": end_date,
        "description": description,
        "creator_name": creator_name,
        "creator_email": creator_email,
        "attendees": attendees,
        "conference_url": conference_url,
        "html_link": html_link,
        "busy": busy,
        "recurring": recurring,
        "editable": editable,
        "visibility": visibility,
      }
    )
    if my_response is not UNSET:
      field_dict["my_response"] = my_response
    if rule is not UNSET:
      field_dict["rule"] = rule
    if recurrence is not UNSET:
      field_dict["recurrence"] = recurrence

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.calendar_event_attendee import CalendarEventAttendee
    from ..models.recurrence_schema import RecurrenceSchema

    d = dict(src_dict)
    id = UUID(d.pop("id"))

    calendar_id = UUID(d.pop("calendar_id"))

    title = d.pop("title")

    def _parse_location(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    location = _parse_location(d.pop("location"))

    all_day = d.pop("all_day")

    def _parse_start_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        start_at_type_0 = datetime.datetime.fromisoformat(data)

        return start_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    start_at = _parse_start_at(d.pop("start_at"))

    def _parse_end_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        end_at_type_0 = datetime.datetime.fromisoformat(data)

        return end_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    end_at = _parse_end_at(d.pop("end_at"))

    def _parse_start_date(data: object) -> datetime.date | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        start_date_type_0 = datetime.date.fromisoformat(data)

        return start_date_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.date | None, data)

    start_date = _parse_start_date(d.pop("start_date"))

    def _parse_end_date(data: object) -> datetime.date | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        end_date_type_0 = datetime.date.fromisoformat(data)

        return end_date_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.date | None, data)

    end_date = _parse_end_date(d.pop("end_date"))

    def _parse_description(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    description = _parse_description(d.pop("description"))

    def _parse_creator_name(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    creator_name = _parse_creator_name(d.pop("creator_name"))

    def _parse_creator_email(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    creator_email = _parse_creator_email(d.pop("creator_email"))

    attendees = []
    _attendees = d.pop("attendees")
    for attendees_item_data in _attendees:
      attendees_item = CalendarEventAttendee.from_dict(attendees_item_data)

      attendees.append(attendees_item)

    def _parse_conference_url(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    conference_url = _parse_conference_url(d.pop("conference_url"))

    def _parse_html_link(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    html_link = _parse_html_link(d.pop("html_link"))

    busy = d.pop("busy")

    recurring = d.pop("recurring")

    editable = d.pop("editable")

    def _parse_visibility(data: object) -> CalendarEventSchemaVisibilityType0 | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        visibility_type_0 = CalendarEventSchemaVisibilityType0(data)

        return visibility_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(CalendarEventSchemaVisibilityType0 | None, data)

    visibility = _parse_visibility(d.pop("visibility"))

    def _parse_my_response(data: object) -> CalendarEventSchemaMyResponseType0 | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        my_response_type_0 = CalendarEventSchemaMyResponseType0(data)

        return my_response_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(CalendarEventSchemaMyResponseType0 | None | Unset, data)

    my_response = _parse_my_response(d.pop("my_response", UNSET))

    def _parse_rule(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    rule = _parse_rule(d.pop("rule", UNSET))

    def _parse_recurrence(data: object) -> None | RecurrenceSchema | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        recurrence_type_0 = RecurrenceSchema.from_dict(data)

        return recurrence_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | RecurrenceSchema | Unset, data)

    recurrence = _parse_recurrence(d.pop("recurrence", UNSET))

    calendar_event_schema = cls(
      id=id,
      calendar_id=calendar_id,
      title=title,
      location=location,
      all_day=all_day,
      start_at=start_at,
      end_at=end_at,
      start_date=start_date,
      end_date=end_date,
      description=description,
      creator_name=creator_name,
      creator_email=creator_email,
      attendees=attendees,
      conference_url=conference_url,
      html_link=html_link,
      busy=busy,
      recurring=recurring,
      editable=editable,
      visibility=visibility,
      my_response=my_response,
      rule=rule,
      recurrence=recurrence,
    )

    calendar_event_schema.additional_properties = d
    return calendar_event_schema

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
