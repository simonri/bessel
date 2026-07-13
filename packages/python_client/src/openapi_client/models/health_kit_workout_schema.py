from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.health_kit_workout_schema_statistics_type_0 import HealthKitWorkoutSchemaStatisticsType0
  from ..models.health_kit_workout_schema_workout_metadata_type_0 import HealthKitWorkoutSchemaWorkoutMetadataType0


T = TypeVar("T", bound="HealthKitWorkoutSchema")


@_attrs_define
class HealthKitWorkoutSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      healthkit_uuid (str):
      workout_activity_type (int):
      workout_activity_type_name (str):
      start_date (datetime.datetime):
      end_date (datetime.datetime):
      duration (float):
      total_energy_burned (float | None):
      total_distance (float | None):
      source_name (str):
      source_bundle_id (str):
      source_version (None | str):
      device_name (None | str):
      workout_metadata (HealthKitWorkoutSchemaWorkoutMetadataType0 | None):
      statistics (HealthKitWorkoutSchemaStatisticsType0 | None):
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  healthkit_uuid: str
  workout_activity_type: int
  workout_activity_type_name: str
  start_date: datetime.datetime
  end_date: datetime.datetime
  duration: float
  total_energy_burned: float | None
  total_distance: float | None
  source_name: str
  source_bundle_id: str
  source_version: None | str
  device_name: None | str
  workout_metadata: HealthKitWorkoutSchemaWorkoutMetadataType0 | None
  statistics: HealthKitWorkoutSchemaStatisticsType0 | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.health_kit_workout_schema_statistics_type_0 import HealthKitWorkoutSchemaStatisticsType0
    from ..models.health_kit_workout_schema_workout_metadata_type_0 import HealthKitWorkoutSchemaWorkoutMetadataType0

    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    healthkit_uuid = self.healthkit_uuid

    workout_activity_type = self.workout_activity_type

    workout_activity_type_name = self.workout_activity_type_name

    start_date = self.start_date.isoformat()

    end_date = self.end_date.isoformat()

    duration = self.duration

    total_energy_burned: float | None
    total_energy_burned = self.total_energy_burned

    total_distance: float | None
    total_distance = self.total_distance

    source_name = self.source_name

    source_bundle_id = self.source_bundle_id

    source_version: None | str
    source_version = self.source_version

    device_name: None | str
    device_name = self.device_name

    workout_metadata: dict[str, Any] | None
    if isinstance(self.workout_metadata, HealthKitWorkoutSchemaWorkoutMetadataType0):
      workout_metadata = self.workout_metadata.to_dict()
    else:
      workout_metadata = self.workout_metadata

    statistics: dict[str, Any] | None
    if isinstance(self.statistics, HealthKitWorkoutSchemaStatisticsType0):
      statistics = self.statistics.to_dict()
    else:
      statistics = self.statistics

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "healthkit_uuid": healthkit_uuid,
        "workout_activity_type": workout_activity_type,
        "workout_activity_type_name": workout_activity_type_name,
        "start_date": start_date,
        "end_date": end_date,
        "duration": duration,
        "total_energy_burned": total_energy_burned,
        "total_distance": total_distance,
        "source_name": source_name,
        "source_bundle_id": source_bundle_id,
        "source_version": source_version,
        "device_name": device_name,
        "workout_metadata": workout_metadata,
        "statistics": statistics,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.health_kit_workout_schema_statistics_type_0 import HealthKitWorkoutSchemaStatisticsType0
    from ..models.health_kit_workout_schema_workout_metadata_type_0 import HealthKitWorkoutSchemaWorkoutMetadataType0

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

    workout_activity_type = d.pop("workout_activity_type")

    workout_activity_type_name = d.pop("workout_activity_type_name")

    start_date = datetime.datetime.fromisoformat(d.pop("start_date"))

    end_date = datetime.datetime.fromisoformat(d.pop("end_date"))

    duration = d.pop("duration")

    def _parse_total_energy_burned(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    total_energy_burned = _parse_total_energy_burned(d.pop("total_energy_burned"))

    def _parse_total_distance(data: object) -> float | None:
      if data is None:
        return data
      return cast(float | None, data)

    total_distance = _parse_total_distance(d.pop("total_distance"))

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

    def _parse_workout_metadata(data: object) -> HealthKitWorkoutSchemaWorkoutMetadataType0 | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        workout_metadata_type_0 = HealthKitWorkoutSchemaWorkoutMetadataType0.from_dict(data)

        return workout_metadata_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(HealthKitWorkoutSchemaWorkoutMetadataType0 | None, data)

    workout_metadata = _parse_workout_metadata(d.pop("workout_metadata"))

    def _parse_statistics(data: object) -> HealthKitWorkoutSchemaStatisticsType0 | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        statistics_type_0 = HealthKitWorkoutSchemaStatisticsType0.from_dict(data)

        return statistics_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(HealthKitWorkoutSchemaStatisticsType0 | None, data)

    statistics = _parse_statistics(d.pop("statistics"))

    health_kit_workout_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      healthkit_uuid=healthkit_uuid,
      workout_activity_type=workout_activity_type,
      workout_activity_type_name=workout_activity_type_name,
      start_date=start_date,
      end_date=end_date,
      duration=duration,
      total_energy_burned=total_energy_burned,
      total_distance=total_distance,
      source_name=source_name,
      source_bundle_id=source_bundle_id,
      source_version=source_version,
      device_name=device_name,
      workout_metadata=workout_metadata,
      statistics=statistics,
    )

    health_kit_workout_schema.additional_properties = d
    return health_kit_workout_schema

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
