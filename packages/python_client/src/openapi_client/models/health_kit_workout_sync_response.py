from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="HealthKitWorkoutSyncResponse")


@_attrs_define
class HealthKitWorkoutSyncResponse:
  """
  Attributes:
      synced (int): Number of workouts inserted or updated.
      deleted (int): Number of workouts soft-deleted.
  """

  synced: int
  deleted: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    synced = self.synced

    deleted = self.deleted

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "synced": synced,
        "deleted": deleted,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    synced = d.pop("synced")

    deleted = d.pop("deleted")

    health_kit_workout_sync_response = cls(
      synced=synced,
      deleted=deleted,
    )

    health_kit_workout_sync_response.additional_properties = d
    return health_kit_workout_sync_response

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
