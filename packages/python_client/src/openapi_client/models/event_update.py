from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.edit_scope import EditScope
from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.event_timing_input import EventTimingInput
  from ..models.recurrence_schema import RecurrenceSchema


T = TypeVar("T", bound="EventUpdate")


@_attrs_define
class EventUpdate:
  """
  Attributes:
      time_zone (str): Zone the user is viewing the calendar in; used to read `recurrence.until`.
      title (None | str | Unset):
      timing (EventTimingInput | None | Unset):
      location (None | str | Unset):
      description (None | str | Unset):
      attendees (list[str] | None | Unset): Guest emails (Google only); replaces the guest list.
      recurrence (None | RecurrenceSchema | Unset): How the event repeats; null stops it repeating.
      busy (bool | None | Unset): False shows the time as free.
      add_conference (bool | None | Unset): Adds a Google Meet link (Google only).
      notify_guests (bool | Unset): Email guests about the change (Google only). Default: True.
      scope (EditScope | Unset): Which occurrences of a repeating event a change applies to.
      calendar_id (None | Unset | UUID): Move the event to another calendar of the same account.
  """

  time_zone: str
  title: None | str | Unset = UNSET
  timing: EventTimingInput | None | Unset = UNSET
  location: None | str | Unset = UNSET
  description: None | str | Unset = UNSET
  attendees: list[str] | None | Unset = UNSET
  recurrence: None | RecurrenceSchema | Unset = UNSET
  busy: bool | None | Unset = UNSET
  add_conference: bool | None | Unset = UNSET
  notify_guests: bool | Unset = True
  scope: EditScope | Unset = UNSET
  calendar_id: None | Unset | UUID = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.event_timing_input import EventTimingInput
    from ..models.recurrence_schema import RecurrenceSchema

    time_zone = self.time_zone

    title: None | str | Unset
    if isinstance(self.title, Unset):
      title = UNSET
    else:
      title = self.title

    timing: dict[str, Any] | None | Unset
    if isinstance(self.timing, Unset):
      timing = UNSET
    elif isinstance(self.timing, EventTimingInput):
      timing = self.timing.to_dict()
    else:
      timing = self.timing

    location: None | str | Unset
    if isinstance(self.location, Unset):
      location = UNSET
    else:
      location = self.location

    description: None | str | Unset
    if isinstance(self.description, Unset):
      description = UNSET
    else:
      description = self.description

    attendees: list[str] | None | Unset
    if isinstance(self.attendees, Unset):
      attendees = UNSET
    elif isinstance(self.attendees, list):
      attendees = self.attendees

    else:
      attendees = self.attendees

    recurrence: dict[str, Any] | None | Unset
    if isinstance(self.recurrence, Unset):
      recurrence = UNSET
    elif isinstance(self.recurrence, RecurrenceSchema):
      recurrence = self.recurrence.to_dict()
    else:
      recurrence = self.recurrence

    busy: bool | None | Unset
    if isinstance(self.busy, Unset):
      busy = UNSET
    else:
      busy = self.busy

    add_conference: bool | None | Unset
    if isinstance(self.add_conference, Unset):
      add_conference = UNSET
    else:
      add_conference = self.add_conference

    notify_guests = self.notify_guests

    scope: str | Unset = UNSET
    if not isinstance(self.scope, Unset):
      scope = self.scope.value

    calendar_id: None | str | Unset
    if isinstance(self.calendar_id, Unset):
      calendar_id = UNSET
    elif isinstance(self.calendar_id, UUID):
      calendar_id = str(self.calendar_id)
    else:
      calendar_id = self.calendar_id

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "time_zone": time_zone,
      }
    )
    if title is not UNSET:
      field_dict["title"] = title
    if timing is not UNSET:
      field_dict["timing"] = timing
    if location is not UNSET:
      field_dict["location"] = location
    if description is not UNSET:
      field_dict["description"] = description
    if attendees is not UNSET:
      field_dict["attendees"] = attendees
    if recurrence is not UNSET:
      field_dict["recurrence"] = recurrence
    if busy is not UNSET:
      field_dict["busy"] = busy
    if add_conference is not UNSET:
      field_dict["add_conference"] = add_conference
    if notify_guests is not UNSET:
      field_dict["notify_guests"] = notify_guests
    if scope is not UNSET:
      field_dict["scope"] = scope
    if calendar_id is not UNSET:
      field_dict["calendar_id"] = calendar_id

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.event_timing_input import EventTimingInput
    from ..models.recurrence_schema import RecurrenceSchema

    d = dict(src_dict)
    time_zone = d.pop("time_zone")

    def _parse_title(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    title = _parse_title(d.pop("title", UNSET))

    def _parse_timing(data: object) -> EventTimingInput | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        timing_type_0 = EventTimingInput.from_dict(data)

        return timing_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(EventTimingInput | None | Unset, data)

    timing = _parse_timing(d.pop("timing", UNSET))

    def _parse_location(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    location = _parse_location(d.pop("location", UNSET))

    def _parse_description(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    description = _parse_description(d.pop("description", UNSET))

    def _parse_attendees(data: object) -> list[str] | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, list):
          raise TypeError()
        attendees_type_0 = cast(list[str], data)

        return attendees_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(list[str] | None | Unset, data)

    attendees = _parse_attendees(d.pop("attendees", UNSET))

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

    def _parse_busy(data: object) -> bool | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(bool | None | Unset, data)

    busy = _parse_busy(d.pop("busy", UNSET))

    def _parse_add_conference(data: object) -> bool | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(bool | None | Unset, data)

    add_conference = _parse_add_conference(d.pop("add_conference", UNSET))

    notify_guests = d.pop("notify_guests", UNSET)

    _scope = d.pop("scope", UNSET)
    scope: EditScope | Unset
    if isinstance(_scope, Unset):
      scope = UNSET
    else:
      scope = EditScope(_scope)

    def _parse_calendar_id(data: object) -> None | Unset | UUID:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        calendar_id_type_0 = UUID(data)

        return calendar_id_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | Unset | UUID, data)

    calendar_id = _parse_calendar_id(d.pop("calendar_id", UNSET))

    event_update = cls(
      time_zone=time_zone,
      title=title,
      timing=timing,
      location=location,
      description=description,
      attendees=attendees,
      recurrence=recurrence,
      busy=busy,
      add_conference=add_conference,
      notify_guests=notify_guests,
      scope=scope,
      calendar_id=calendar_id,
    )

    event_update.additional_properties = d
    return event_update

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
