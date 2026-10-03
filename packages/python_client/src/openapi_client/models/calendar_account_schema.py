from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.calendar_provider import CalendarProvider
from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.calendar_schema import CalendarSchema


T = TypeVar("T", bound="CalendarAccountSchema")


@_attrs_define
class CalendarAccountSchema:
  """
  Attributes:
      id (UUID):
      provider (CalendarProvider):
      email (str):
      can_write (bool): False when the account was connected read-only and must be reconnected to edit.
      last_synced_at (datetime.datetime | None):
      sync_error (None | str): Why the last sync failed, or null if it succeeded.
      calendars (list[CalendarSchema]):
      can_read_people (bool | Unset): Google: contacts access was granted, so guests show real names and photos.
          Default: False.
  """

  id: UUID
  provider: CalendarProvider
  email: str
  can_write: bool
  last_synced_at: datetime.datetime | None
  sync_error: None | str
  calendars: list[CalendarSchema]
  can_read_people: bool | Unset = False
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    provider = self.provider.value

    email = self.email

    can_write = self.can_write

    last_synced_at: None | str
    if isinstance(self.last_synced_at, datetime.datetime):
      last_synced_at = self.last_synced_at.isoformat()
    else:
      last_synced_at = self.last_synced_at

    sync_error: None | str
    sync_error = self.sync_error

    calendars = []
    for calendars_item_data in self.calendars:
      calendars_item = calendars_item_data.to_dict()
      calendars.append(calendars_item)

    can_read_people = self.can_read_people

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "provider": provider,
        "email": email,
        "can_write": can_write,
        "last_synced_at": last_synced_at,
        "sync_error": sync_error,
        "calendars": calendars,
      }
    )
    if can_read_people is not UNSET:
      field_dict["can_read_people"] = can_read_people

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.calendar_schema import CalendarSchema

    d = dict(src_dict)
    id = UUID(d.pop("id"))

    provider = CalendarProvider(d.pop("provider"))

    email = d.pop("email")

    can_write = d.pop("can_write")

    def _parse_last_synced_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        last_synced_at_type_0 = datetime.datetime.fromisoformat(data)

        return last_synced_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    last_synced_at = _parse_last_synced_at(d.pop("last_synced_at"))

    def _parse_sync_error(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    sync_error = _parse_sync_error(d.pop("sync_error"))

    calendars = []
    _calendars = d.pop("calendars")
    for calendars_item_data in _calendars:
      calendars_item = CalendarSchema.from_dict(calendars_item_data)

      calendars.append(calendars_item)

    can_read_people = d.pop("can_read_people", UNSET)

    calendar_account_schema = cls(
      id=id,
      provider=provider,
      email=email,
      can_write=can_write,
      last_synced_at=last_synced_at,
      sync_error=sync_error,
      calendars=calendars,
      can_read_people=can_read_people,
    )

    calendar_account_schema.additional_properties = d
    return calendar_account_schema

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
