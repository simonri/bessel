from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.notification_create_kind import NotificationCreateKind
from ..types import UNSET, Unset

T = TypeVar("T", bound="NotificationCreate")


@_attrs_define
class NotificationCreate:
  """
  Attributes:
      title (str): Short notification title.
      body (None | str | Unset): Optional longer description.
      kind (NotificationCreateKind | Unset): Severity/type of notification. Default: NotificationCreateKind.INFO.
  """

  title: str
  body: None | str | Unset = UNSET
  kind: NotificationCreateKind | Unset = NotificationCreateKind.INFO
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    title = self.title

    body: None | str | Unset
    if isinstance(self.body, Unset):
      body = UNSET
    else:
      body = self.body

    kind: str | Unset = UNSET
    if not isinstance(self.kind, Unset):
      kind = self.kind.value

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "title": title,
      }
    )
    if body is not UNSET:
      field_dict["body"] = body
    if kind is not UNSET:
      field_dict["kind"] = kind

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    title = d.pop("title")

    def _parse_body(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    body = _parse_body(d.pop("body", UNSET))

    _kind = d.pop("kind", UNSET)
    kind: NotificationCreateKind | Unset
    if isinstance(_kind, Unset):
      kind = UNSET
    else:
      kind = NotificationCreateKind(_kind)

    notification_create = cls(
      title=title,
      body=body,
      kind=kind,
    )

    notification_create.additional_properties = d
    return notification_create

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
