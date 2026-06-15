from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ActivityEventIn")


@_attrs_define
class ActivityEventIn:
  """
  Attributes:
      local_id (int): Original SQLite id from the source machine.
      ts (int): Unix epoch seconds (UTC) when the event was recorded.
      state (str): 'active' or 'idle'.
      app_class (None | str | Unset): Window class / app identifier.
      title (None | str | Unset): Window title.
      workspace (None | str | Unset): Workspace name or number.
  """

  local_id: int
  ts: int
  state: str
  app_class: None | str | Unset = UNSET
  title: None | str | Unset = UNSET
  workspace: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    local_id = self.local_id

    ts = self.ts

    state = self.state

    app_class: None | str | Unset
    if isinstance(self.app_class, Unset):
      app_class = UNSET
    else:
      app_class = self.app_class

    title: None | str | Unset
    if isinstance(self.title, Unset):
      title = UNSET
    else:
      title = self.title

    workspace: None | str | Unset
    if isinstance(self.workspace, Unset):
      workspace = UNSET
    else:
      workspace = self.workspace

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "local_id": local_id,
        "ts": ts,
        "state": state,
      }
    )
    if app_class is not UNSET:
      field_dict["app_class"] = app_class
    if title is not UNSET:
      field_dict["title"] = title
    if workspace is not UNSET:
      field_dict["workspace"] = workspace

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    local_id = d.pop("local_id")

    ts = d.pop("ts")

    state = d.pop("state")

    def _parse_app_class(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    app_class = _parse_app_class(d.pop("app_class", UNSET))

    def _parse_title(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    title = _parse_title(d.pop("title", UNSET))

    def _parse_workspace(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    workspace = _parse_workspace(d.pop("workspace", UNSET))

    activity_event_in = cls(
      local_id=local_id,
      ts=ts,
      state=state,
      app_class=app_class,
      title=title,
      workspace=workspace,
    )

    activity_event_in.additional_properties = d
    return activity_event_in

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
