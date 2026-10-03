from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="ICloudConnectRequest")


@_attrs_define
class ICloudConnectRequest:
  """
  Attributes:
      apple_id (str):
      app_password (str): App-specific password from account.apple.com.
  """

  apple_id: str
  app_password: str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    apple_id = self.apple_id

    app_password = self.app_password

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "apple_id": apple_id,
        "app_password": app_password,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    apple_id = d.pop("apple_id")

    app_password = d.pop("app_password")

    i_cloud_connect_request = cls(
      apple_id=apple_id,
      app_password=app_password,
    )

    i_cloud_connect_request.additional_properties = d
    return i_cloud_connect_request

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
