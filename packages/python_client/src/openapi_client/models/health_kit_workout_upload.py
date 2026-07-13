from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.health_kit_workout_upload_statistics_type_0 import HealthKitWorkoutUploadStatisticsType0
  from ..models.health_kit_workout_upload_workout_metadata_type_0 import HealthKitWorkoutUploadWorkoutMetadataType0


T = TypeVar("T", bound="HealthKitWorkoutUpload")


@_attrs_define
class HealthKitWorkoutUpload:
  """One HKWorkout sample, mirrored field-by-field from HealthKit.

  Attributes:
      healthkit_uuid (str): HKObject.uuid, stable across devices.
      workout_activity_type (int): HKWorkoutActivityType raw value.
      workout_activity_type_name (str): Human-readable activity type, e.g. 'running'.
      start_date (datetime.datetime):
      end_date (datetime.datetime):
      duration (float): Duration in seconds.
      source_name (str):
      source_bundle_id (str):
      total_energy_burned (float | None | Unset): Active energy in kcal.
      total_distance (float | None | Unset): Distance in meters.
      source_version (None | str | Unset):
      device_name (None | str | Unset):
      workout_metadata (HealthKitWorkoutUploadWorkoutMetadataType0 | None | Unset): HKWorkout.metadata, JSON-safe
          subset.
      statistics (HealthKitWorkoutUploadStatisticsType0 | None | Unset): Per-quantity statistics keyed by HK
          identifier.
  """

  healthkit_uuid: str
  workout_activity_type: int
  workout_activity_type_name: str
  start_date: datetime.datetime
  end_date: datetime.datetime
  duration: float
  source_name: str
  source_bundle_id: str
  total_energy_burned: float | None | Unset = UNSET
  total_distance: float | None | Unset = UNSET
  source_version: None | str | Unset = UNSET
  device_name: None | str | Unset = UNSET
  workout_metadata: HealthKitWorkoutUploadWorkoutMetadataType0 | None | Unset = UNSET
  statistics: HealthKitWorkoutUploadStatisticsType0 | None | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.health_kit_workout_upload_statistics_type_0 import HealthKitWorkoutUploadStatisticsType0
    from ..models.health_kit_workout_upload_workout_metadata_type_0 import HealthKitWorkoutUploadWorkoutMetadataType0

    healthkit_uuid = self.healthkit_uuid

    workout_activity_type = self.workout_activity_type

    workout_activity_type_name = self.workout_activity_type_name

    start_date = self.start_date.isoformat()

    end_date = self.end_date.isoformat()

    duration = self.duration

    source_name = self.source_name

    source_bundle_id = self.source_bundle_id

    total_energy_burned: float | None | Unset
    if isinstance(self.total_energy_burned, Unset):
      total_energy_burned = UNSET
    else:
      total_energy_burned = self.total_energy_burned

    total_distance: float | None | Unset
    if isinstance(self.total_distance, Unset):
      total_distance = UNSET
    else:
      total_distance = self.total_distance

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

    workout_metadata: dict[str, Any] | None | Unset
    if isinstance(self.workout_metadata, Unset):
      workout_metadata = UNSET
    elif isinstance(self.workout_metadata, HealthKitWorkoutUploadWorkoutMetadataType0):
      workout_metadata = self.workout_metadata.to_dict()
    else:
      workout_metadata = self.workout_metadata

    statistics: dict[str, Any] | None | Unset
    if isinstance(self.statistics, Unset):
      statistics = UNSET
    elif isinstance(self.statistics, HealthKitWorkoutUploadStatisticsType0):
      statistics = self.statistics.to_dict()
    else:
      statistics = self.statistics

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "healthkit_uuid": healthkit_uuid,
        "workout_activity_type": workout_activity_type,
        "workout_activity_type_name": workout_activity_type_name,
        "start_date": start_date,
        "end_date": end_date,
        "duration": duration,
        "source_name": source_name,
        "source_bundle_id": source_bundle_id,
      }
    )
    if total_energy_burned is not UNSET:
      field_dict["total_energy_burned"] = total_energy_burned
    if total_distance is not UNSET:
      field_dict["total_distance"] = total_distance
    if source_version is not UNSET:
      field_dict["source_version"] = source_version
    if device_name is not UNSET:
      field_dict["device_name"] = device_name
    if workout_metadata is not UNSET:
      field_dict["workout_metadata"] = workout_metadata
    if statistics is not UNSET:
      field_dict["statistics"] = statistics

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.health_kit_workout_upload_statistics_type_0 import HealthKitWorkoutUploadStatisticsType0
    from ..models.health_kit_workout_upload_workout_metadata_type_0 import HealthKitWorkoutUploadWorkoutMetadataType0

    d = dict(src_dict)
    healthkit_uuid = d.pop("healthkit_uuid")

    workout_activity_type = d.pop("workout_activity_type")

    workout_activity_type_name = d.pop("workout_activity_type_name")

    start_date = datetime.datetime.fromisoformat(d.pop("start_date"))

    end_date = datetime.datetime.fromisoformat(d.pop("end_date"))

    duration = d.pop("duration")

    source_name = d.pop("source_name")

    source_bundle_id = d.pop("source_bundle_id")

    def _parse_total_energy_burned(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    total_energy_burned = _parse_total_energy_burned(d.pop("total_energy_burned", UNSET))

    def _parse_total_distance(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    total_distance = _parse_total_distance(d.pop("total_distance", UNSET))

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

    def _parse_workout_metadata(data: object) -> HealthKitWorkoutUploadWorkoutMetadataType0 | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        workout_metadata_type_0 = HealthKitWorkoutUploadWorkoutMetadataType0.from_dict(data)

        return workout_metadata_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(HealthKitWorkoutUploadWorkoutMetadataType0 | None | Unset, data)

    workout_metadata = _parse_workout_metadata(d.pop("workout_metadata", UNSET))

    def _parse_statistics(data: object) -> HealthKitWorkoutUploadStatisticsType0 | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        statistics_type_0 = HealthKitWorkoutUploadStatisticsType0.from_dict(data)

        return statistics_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(HealthKitWorkoutUploadStatisticsType0 | None | Unset, data)

    statistics = _parse_statistics(d.pop("statistics", UNSET))

    health_kit_workout_upload = cls(
      healthkit_uuid=healthkit_uuid,
      workout_activity_type=workout_activity_type,
      workout_activity_type_name=workout_activity_type_name,
      start_date=start_date,
      end_date=end_date,
      duration=duration,
      source_name=source_name,
      source_bundle_id=source_bundle_id,
      total_energy_burned=total_energy_burned,
      total_distance=total_distance,
      source_version=source_version,
      device_name=device_name,
      workout_metadata=workout_metadata,
      statistics=statistics,
    )

    health_kit_workout_upload.additional_properties = d
    return health_kit_workout_upload

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
