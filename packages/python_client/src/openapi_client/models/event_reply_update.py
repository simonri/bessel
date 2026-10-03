from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.edit_scope import EditScope
from ..models.event_reply_update_response import EventReplyUpdateResponse
from ..types import UNSET, Unset

T = TypeVar("T", bound="EventReplyUpdate")


@_attrs_define
class EventReplyUpdate:
  """
  Attributes:
      response (EventReplyUpdateResponse): Your answer to the invitation.
      scope (EditScope | Unset): Which occurrences of a repeating event a change applies to.
      notify_organizer (bool | Unset): Email the organizer your answer (Google only; iCloud always does). Default:
          True.
  """

  response: EventReplyUpdateResponse
  scope: EditScope | Unset = UNSET
  notify_organizer: bool | Unset = True
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    response = self.response.value

    scope: str | Unset = UNSET
    if not isinstance(self.scope, Unset):
      scope = self.scope.value

    notify_organizer = self.notify_organizer

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "response": response,
      }
    )
    if scope is not UNSET:
      field_dict["scope"] = scope
    if notify_organizer is not UNSET:
      field_dict["notify_organizer"] = notify_organizer

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    response = EventReplyUpdateResponse(d.pop("response"))

    _scope = d.pop("scope", UNSET)
    scope: EditScope | Unset
    if isinstance(_scope, Unset):
      scope = UNSET
    else:
      scope = EditScope(_scope)

    notify_organizer = d.pop("notify_organizer", UNSET)

    event_reply_update = cls(
      response=response,
      scope=scope,
      notify_organizer=notify_organizer,
    )

    event_reply_update.additional_properties = d
    return event_reply_update

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
