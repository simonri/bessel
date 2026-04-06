from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.task_status import TaskStatus
from ..types import UNSET, Unset

T = TypeVar("T", bound="TaskReorderItem")


@_attrs_define
class TaskReorderItem:
  """
  Attributes:
      id (UUID):
      position (float):
      status (None | TaskStatus | Unset):
  """

  id: UUID
  position: float
  status: None | TaskStatus | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    position = self.position

    status: None | str | Unset
    if isinstance(self.status, Unset):
      status = UNSET
    elif isinstance(self.status, TaskStatus):
      status = self.status.value
    else:
      status = self.status

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "position": position,
      }
    )
    if status is not UNSET:
      field_dict["status"] = status

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    id = UUID(d.pop("id"))

    position = d.pop("position")

    def _parse_status(data: object) -> None | TaskStatus | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        status_type_0 = TaskStatus(data)

        return status_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | TaskStatus | Unset, data)

    status = _parse_status(d.pop("status", UNSET))

    task_reorder_item = cls(
      id=id,
      position=position,
      status=status,
    )

    task_reorder_item.additional_properties = d
    return task_reorder_item

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
