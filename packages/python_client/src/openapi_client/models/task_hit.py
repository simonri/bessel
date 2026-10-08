from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.task_status import TaskStatus

T = TypeVar("T", bound="TaskHit")


@_attrs_define
class TaskHit:
  """
  Attributes:
      id (UUID):
      title (str):
      status (TaskStatus):
  """

  id: UUID
  title: str
  status: TaskStatus
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    title = self.title

    status = self.status.value

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "title": title,
        "status": status,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    id = UUID(d.pop("id"))

    title = d.pop("title")

    status = TaskStatus(d.pop("status"))

    task_hit = cls(
      id=id,
      title=title,
      status=status,
    )

    task_hit.additional_properties = d
    return task_hit

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
