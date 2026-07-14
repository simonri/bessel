from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.health_kit_sleep_sample_upload_sample_metadata_type_0 import HealthKitSleepSampleUploadSampleMetadataType0


T = TypeVar("T", bound="HealthKitSleepSampleUpload")


@_attrs_define
class HealthKitSleepSampleUpload:
  """One HKCategorySample for sleep analysis, mirrored field-by-field from HealthKit.

  Attributes:
      healthkit_uuid (str): HKObject.uuid, stable across devices.
      sleep_value (int): HKCategoryValueSleepAnalysis raw value.
      sleep_value_name (str): e.g. 'asleepCore', 'awake', 'inBed'.
      start_date (datetime.datetime):
      end_date (datetime.datetime):
      source_name (str):
      source_bundle_id (str):
      source_version (None | str | Unset):
      device_name (None | str | Unset):
      sample_metadata (HealthKitSleepSampleUploadSampleMetadataType0 | None | Unset): HKCategorySample.metadata, JSON-
          safe subset.
  """

  healthkit_uuid: str
  sleep_value: int
  sleep_value_name: str
  start_date: datetime.datetime
  end_date: datetime.datetime
  source_name: str
  source_bundle_id: str
  source_version: None | str | Unset = UNSET
  device_name: None | str | Unset = UNSET
  sample_metadata: HealthKitSleepSampleUploadSampleMetadataType0 | None | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.health_kit_sleep_sample_upload_sample_metadata_type_0 import HealthKitSleepSampleUploadSampleMetadataType0

    healthkit_uuid = self.healthkit_uuid

    sleep_value = self.sleep_value

    sleep_value_name = self.sleep_value_name

    start_date = self.start_date.isoformat()

    end_date = self.end_date.isoformat()

    source_name = self.source_name

    source_bundle_id = self.source_bundle_id

    source_version: None | str | Unset
    if isinstance(self.source_version, Unset):
      source_version = UNSET
    else:
      source_version = self.source_version

    device_name: None | str | Unset
    if isinstance(self.device_name, Unset):
      device_name = UNSET
    else:
      device_name = self.device_name

    sample_metadata: dict[str, Any] | None | Unset
    if isinstance(self.sample_metadata, Unset):
      sample_metadata = UNSET
    elif isinstance(self.sample_metadata, HealthKitSleepSampleUploadSampleMetadataType0):
      sample_metadata = self.sample_metadata.to_dict()
    else:
      sample_metadata = self.sample_metadata

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "healthkit_uuid": healthkit_uuid,
        "sleep_value": sleep_value,
        "sleep_value_name": sleep_value_name,
        "start_date": start_date,
        "end_date": end_date,
        "source_name": source_name,
        "source_bundle_id": source_bundle_id,
      }
    )
    if source_version is not UNSET:
      field_dict["source_version"] = source_version
    if device_name is not UNSET:
      field_dict["device_name"] = device_name
    if sample_metadata is not UNSET:
      field_dict["sample_metadata"] = sample_metadata

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.health_kit_sleep_sample_upload_sample_metadata_type_0 import HealthKitSleepSampleUploadSampleMetadataType0

    d = dict(src_dict)
    healthkit_uuid = d.pop("healthkit_uuid")

    sleep_value = d.pop("sleep_value")

    sleep_value_name = d.pop("sleep_value_name")

    start_date = datetime.datetime.fromisoformat(d.pop("start_date"))

    end_date = datetime.datetime.fromisoformat(d.pop("end_date"))

    source_name = d.pop("source_name")

    source_bundle_id = d.pop("source_bundle_id")

    def _parse_source_version(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    source_version = _parse_source_version(d.pop("source_version", UNSET))

    def _parse_device_name(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    device_name = _parse_device_name(d.pop("device_name", UNSET))

    def _parse_sample_metadata(data: object) -> HealthKitSleepSampleUploadSampleMetadataType0 | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        sample_metadata_type_0 = HealthKitSleepSampleUploadSampleMetadataType0.from_dict(data)

        return sample_metadata_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(HealthKitSleepSampleUploadSampleMetadataType0 | None | Unset, data)

    sample_metadata = _parse_sample_metadata(d.pop("sample_metadata", UNSET))

    health_kit_sleep_sample_upload = cls(
      healthkit_uuid=healthkit_uuid,
      sleep_value=sleep_value,
      sleep_value_name=sleep_value_name,
      start_date=start_date,
      end_date=end_date,
      source_name=source_name,
      source_bundle_id=source_bundle_id,
      source_version=source_version,
      device_name=device_name,
      sample_metadata=sample_metadata,
    )

    health_kit_sleep_sample_upload.additional_properties = d
    return health_kit_sleep_sample_upload

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
