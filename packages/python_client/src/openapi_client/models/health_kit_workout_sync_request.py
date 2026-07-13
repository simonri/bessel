from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.health_kit_workout_upload import HealthKitWorkoutUpload


T = TypeVar("T", bound="HealthKitWorkoutSyncRequest")


@_attrs_define
class HealthKitWorkoutSyncRequest:
  """
  Attributes:
      workouts (list[HealthKitWorkoutUpload] | Unset):
      deleted_uuids (list[str] | Unset): HealthKit UUIDs of workouts deleted on-device since the last sync anchor.
  """

  workouts: list[HealthKitWorkoutUpload] | Unset = UNSET
  deleted_uuids: list[str] | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    workouts: list[dict[str, Any]] | Unset = UNSET
    if not isinstance(self.workouts, Unset):
      workouts = []
      for workouts_item_data in self.workouts:
        workouts_item = workouts_item_data.to_dict()
        workouts.append(workouts_item)

    deleted_uuids: list[str] | Unset = UNSET
    if not isinstance(self.deleted_uuids, Unset):
      deleted_uuids = self.deleted_uuids

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if workouts is not UNSET:
      field_dict["workouts"] = workouts
    if deleted_uuids is not UNSET:
      field_dict["deleted_uuids"] = deleted_uuids

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.health_kit_workout_upload import HealthKitWorkoutUpload

    d = dict(src_dict)
    _workouts = d.pop("workouts", UNSET)
    workouts: list[HealthKitWorkoutUpload] | Unset = UNSET
    if _workouts is not UNSET:
      workouts = []
      for workouts_item_data in _workouts:
        workouts_item = HealthKitWorkoutUpload.from_dict(workouts_item_data)

        workouts.append(workouts_item)

    deleted_uuids = cast(list[str], d.pop("deleted_uuids", UNSET))

    health_kit_workout_sync_request = cls(
      workouts=workouts,
      deleted_uuids=deleted_uuids,
    )

    health_kit_workout_sync_request.additional_properties = d
    return health_kit_workout_sync_request

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
