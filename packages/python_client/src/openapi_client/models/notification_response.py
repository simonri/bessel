from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="NotificationResponse")


@_attrs_define
class NotificationResponse:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      title (str):
      body (None | str):
      kind (str):
      read_at (datetime.datetime | None):
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  title: str
  body: None | str
  kind: str
  read_at: datetime.datetime | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    title = self.title

    body: None | str
    body = self.body

    kind = self.kind

    read_at: None | str
    if isinstance(self.read_at, datetime.datetime):
      read_at = self.read_at.isoformat()
    else:
      read_at = self.read_at

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "title": title,
        "body": body,
        "kind": kind,
        "read_at": read_at,
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

    title = d.pop("title")

    def _parse_body(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    body = _parse_body(d.pop("body"))

    kind = d.pop("kind")

    def _parse_read_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        read_at_type_0 = datetime.datetime.fromisoformat(data)

        return read_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    read_at = _parse_read_at(d.pop("read_at"))

    notification_response = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      title=title,
      body=body,
      kind=kind,
      read_at=read_at,
    )

    notification_response.additional_properties = d
    return notification_response

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
