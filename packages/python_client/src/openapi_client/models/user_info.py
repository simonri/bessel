from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="UserInfo")


@_attrs_define
class UserInfo:
  """
  Attributes:
      sub (str):
      email (None | str | Unset):
      name (None | str | Unset):
      picture (None | str | Unset):
      roles (list[str] | Unset):
  """

  sub: str
  email: None | str | Unset = UNSET
  name: None | str | Unset = UNSET
  picture: None | str | Unset = UNSET
  roles: list[str] | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    sub = self.sub

    email: None | str | Unset
    if isinstance(self.email, Unset):
      email = UNSET
    else:
      email = self.email

    name: None | str | Unset
    if isinstance(self.name, Unset):
      name = UNSET
    else:
      name = self.name

    picture: None | str | Unset
    if isinstance(self.picture, Unset):
      picture = UNSET
    else:
      picture = self.picture

    roles: list[str] | Unset = UNSET
    if not isinstance(self.roles, Unset):
      roles = self.roles

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "sub": sub,
      }
    )
    if email is not UNSET:
      field_dict["email"] = email
    if name is not UNSET:
      field_dict["name"] = name
    if picture is not UNSET:
      field_dict["picture"] = picture
    if roles is not UNSET:
      field_dict["roles"] = roles

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    sub = d.pop("sub")

    def _parse_email(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    email = _parse_email(d.pop("email", UNSET))

    def _parse_name(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    name = _parse_name(d.pop("name", UNSET))

    def _parse_picture(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    picture = _parse_picture(d.pop("picture", UNSET))

    roles = cast(list[str], d.pop("roles", UNSET))

    user_info = cls(
      sub=sub,
      email=email,
      name=name,
      picture=picture,
      roles=roles,
    )

    user_info.additional_properties = d
    return user_info

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
