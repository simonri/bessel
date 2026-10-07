from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.client_diagnostics_upload_payloads_item import ClientDiagnosticsUploadPayloadsItem


T = TypeVar("T", bound="ClientDiagnosticsUpload")


@_attrs_define
class ClientDiagnosticsUpload:
  """
  Attributes:
      platform (str): Client platform, e.g. ios.
      version (str): App version.
      build (str): App build number.
      payloads (list[ClientDiagnosticsUploadPayloadsItem]): Crash, hang and other diagnostic reports as the OS
          produced them (MetricKit on iOS).
  """

  platform: str
  version: str
  build: str
  payloads: list[ClientDiagnosticsUploadPayloadsItem]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    platform = self.platform

    version = self.version

    build = self.build

    payloads = []
    for payloads_item_data in self.payloads:
      payloads_item = payloads_item_data.to_dict()
      payloads.append(payloads_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "platform": platform,
        "version": version,
        "build": build,
        "payloads": payloads,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.client_diagnostics_upload_payloads_item import ClientDiagnosticsUploadPayloadsItem

    d = dict(src_dict)
    platform = d.pop("platform")

    version = d.pop("version")

    build = d.pop("build")

    payloads = []
    _payloads = d.pop("payloads")
    for payloads_item_data in _payloads:
      payloads_item = ClientDiagnosticsUploadPayloadsItem.from_dict(payloads_item_data)

      payloads.append(payloads_item)

    client_diagnostics_upload = cls(
      platform=platform,
      version=version,
      build=build,
      payloads=payloads,
    )

    client_diagnostics_upload.additional_properties = d
    return client_diagnostics_upload

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
