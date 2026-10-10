from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="TimeProjectSchema")


@_attrs_define
class TimeProjectSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      name (str):
      client (None | str):
      color (str):
      hourly_rate (float | None):
      currency (None | str):
      archived_at (datetime.datetime | None):
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  name: str
  client: None | str
  color: str
  hourly_rate: float | None
  currency: None | str
  archived_at: datetime.datetime | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    name = self.name

    client: None | str
    client = self.client

    color = self.color

    hourly_rate: float | None
    hourly_rate = self.hourly_rate

    currency: None | str
    currency = self.currency

    archived_at: None | str
    if isinstance(self.archived_at, datetime.datetime):
      archived_at = self.archived_at.isoformat()
    else:
      archived_at = self.archived_at

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "name": name,
        "client": client,
        "color": color,
        "hourly_rate": hourly_rate,
        "currency": currency,
        "archived_at": archived_at,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    created_at = datetime.datetime.fromisoformat(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = datetime.datetime.fromisoformat(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    name = d.pop("name")

    def _parse_client(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    client = _parse_client(d.pop("client"))

    color = d.pop("color")

    def _parse_hourly_rate(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    hourly_rate = _parse_hourly_rate(d.pop("hourly_rate"))

    def _parse_currency(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    currency = _parse_currency(d.pop("currency"))

    def _parse_archived_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        archived_at_type_0 = datetime.datetime.fromisoformat(data)

        return archived_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    archived_at = _parse_archived_at(d.pop("archived_at"))

    time_project_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      name=name,
      client=client,
      color=color,
      hourly_rate=hourly_rate,
      currency=currency,
      archived_at=archived_at,
    )

    time_project_schema.additional_properties = d
    return time_project_schema

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
