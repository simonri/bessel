from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.health_kit_sleep_sample_upload import HealthKitSleepSampleUpload


T = TypeVar("T", bound="HealthKitSleepSyncRequest")


@_attrs_define
class HealthKitSleepSyncRequest:
  """
  Attributes:
      samples (list[HealthKitSleepSampleUpload] | Unset):
      deleted_uuids (list[str] | Unset): HealthKit UUIDs of sleep samples deleted on-device since the last sync
          anchor.
  """

  samples: list[HealthKitSleepSampleUpload] | Unset = UNSET
  deleted_uuids: list[str] | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    samples: list[dict[str, Any]] | Unset = UNSET
    if not isinstance(self.samples, Unset):
      samples = []
      for samples_item_data in self.samples:
        samples_item = samples_item_data.to_dict()
        samples.append(samples_item)

    deleted_uuids: list[str] | Unset = UNSET
    if not isinstance(self.deleted_uuids, Unset):
      deleted_uuids = self.deleted_uuids

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if samples is not UNSET:
      field_dict["samples"] = samples
    if deleted_uuids is not UNSET:
      field_dict["deleted_uuids"] = deleted_uuids

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.health_kit_sleep_sample_upload import HealthKitSleepSampleUpload

    d = dict(src_dict)
    _samples = d.pop("samples", UNSET)
    samples: list[HealthKitSleepSampleUpload] | Unset = UNSET
    if _samples is not UNSET:
      samples = []
      for samples_item_data in _samples:
        samples_item = HealthKitSleepSampleUpload.from_dict(samples_item_data)

        samples.append(samples_item)

    deleted_uuids = cast(list[str], d.pop("deleted_uuids", UNSET))

    health_kit_sleep_sync_request = cls(
      samples=samples,
      deleted_uuids=deleted_uuids,
    )

    health_kit_sleep_sync_request.additional_properties = d
    return health_kit_sleep_sync_request

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
