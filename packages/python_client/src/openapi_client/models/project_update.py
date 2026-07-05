from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="ProjectUpdate")


@_attrs_define
class ProjectUpdate:
  """
  Attributes:
      name (None | str | Unset):
      path (None | str | Unset):
      ssh_host (None | str | Unset):
  """

  name: None | str | Unset = UNSET
  path: None | str | Unset = UNSET
  ssh_host: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    name: None | str | Unset
    if isinstance(self.name, Unset):
      name = UNSET
    else:
      name = self.name

    path: None | str | Unset
    if isinstance(self.path, Unset):
      path = UNSET
    else:
      path = self.path

    ssh_host: None | str | Unset
    if isinstance(self.ssh_host, Unset):
      ssh_host = UNSET
    else:
      ssh_host = self.ssh_host

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if name is not UNSET:
      field_dict["name"] = name
    if path is not UNSET:
      field_dict["path"] = path
    if ssh_host is not UNSET:
      field_dict["ssh_host"] = ssh_host

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_name(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    name = _parse_name(d.pop("name", UNSET))

    def _parse_path(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    path = _parse_path(d.pop("path", UNSET))

    def _parse_ssh_host(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    ssh_host = _parse_ssh_host(d.pop("ssh_host", UNSET))

    project_update = cls(
      name=name,
      path=path,
      ssh_host=ssh_host,
    )

    project_update.additional_properties = d
    return project_update

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
