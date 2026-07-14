from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.health_kit_sleep_sample_schema_sample_metadata_type_0 import HealthKitSleepSampleSchemaSampleMetadataType0


T = TypeVar("T", bound="HealthKitSleepSampleSchema")


@_attrs_define
class HealthKitSleepSampleSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      healthkit_uuid (str):
      sleep_value (int):
      sleep_value_name (str):
      start_date (datetime.datetime):
      end_date (datetime.datetime):
      source_name (str):
      source_bundle_id (str):
      source_version (None | str):
      device_name (None | str):
      sample_metadata (HealthKitSleepSampleSchemaSampleMetadataType0 | None):
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  healthkit_uuid: str
  sleep_value: int
  sleep_value_name: str
  start_date: datetime.datetime
  end_date: datetime.datetime
  source_name: str
  source_bundle_id: str
  source_version: None | str
  device_name: None | str
  sample_metadata: HealthKitSleepSampleSchemaSampleMetadataType0 | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.health_kit_sleep_sample_schema_sample_metadata_type_0 import HealthKitSleepSampleSchemaSampleMetadataType0

    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    healthkit_uuid = self.healthkit_uuid

    sleep_value = self.sleep_value

    sleep_value_name = self.sleep_value_name

    start_date = self.start_date.isoformat()

    end_date = self.end_date.isoformat()

    source_name = self.source_name

    source_bundle_id = self.source_bundle_id

    source_version: None | str
    source_version = self.source_version

    device_name: None | str
    device_name = self.device_name

    sample_metadata: dict[str, Any] | None
    if isinstance(self.sample_metadata, HealthKitSleepSampleSchemaSampleMetadataType0):
      sample_metadata = self.sample_metadata.to_dict()
    else:
      sample_metadata = self.sample_metadata

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "healthkit_uuid": healthkit_uuid,
        "sleep_value": sleep_value,
        "sleep_value_name": sleep_value_name,
        "start_date": start_date,
        "end_date": end_date,
        "source_name": source_name,
        "source_bundle_id": source_bundle_id,
        "source_version": source_version,
        "device_name": device_name,
        "sample_metadata": sample_metadata,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.health_kit_sleep_sample_schema_sample_metadata_type_0 import HealthKitSleepSampleSchemaSampleMetadataType0

    d = dict(src_dict)
    created_at = datetime.datetime.fromisoformat(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = datetime.datetime.fromisoformat(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    healthkit_uuid = d.pop("healthkit_uuid")

    sleep_value = d.pop("sleep_value")

    sleep_value_name = d.pop("sleep_value_name")

    start_date = datetime.datetime.fromisoformat(d.pop("start_date"))

    end_date = datetime.datetime.fromisoformat(d.pop("end_date"))

    source_name = d.pop("source_name")

    source_bundle_id = d.pop("source_bundle_id")

    def _parse_source_version(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    source_version = _parse_source_version(d.pop("source_version"))

    def _parse_device_name(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    device_name = _parse_device_name(d.pop("device_name"))

    def _parse_sample_metadata(data: object) -> HealthKitSleepSampleSchemaSampleMetadataType0 | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        sample_metadata_type_0 = HealthKitSleepSampleSchemaSampleMetadataType0.from_dict(data)

        return sample_metadata_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(HealthKitSleepSampleSchemaSampleMetadataType0 | None, data)

    sample_metadata = _parse_sample_metadata(d.pop("sample_metadata"))

    health_kit_sleep_sample_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
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

    health_kit_sleep_sample_schema.additional_properties = d
    return health_kit_sleep_sample_schema

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
