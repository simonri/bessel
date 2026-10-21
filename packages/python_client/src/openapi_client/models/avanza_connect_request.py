from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="AvanzaConnectRequest")


@_attrs_define
class AvanzaConnectRequest:
  """
  Attributes:
      username (str):
      password (str):
      totp_secret (str): The secret Avanza shows when adding 'another app' for two-factor login.
  """

  username: str
  password: str
  totp_secret: str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    username = self.username

    password = self.password

    totp_secret = self.totp_secret

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "username": username,
        "password": password,
        "totp_secret": totp_secret,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    username = d.pop("username")

    password = d.pop("password")

    totp_secret = d.pop("totp_secret")

    avanza_connect_request = cls(
      username=username,
      password=password,
      totp_secret=totp_secret,
    )

    avanza_connect_request.additional_properties = d
    return avanza_connect_request

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
