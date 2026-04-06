from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.task_schema import TaskSchema


T = TypeVar("T", bound="TaskCompleteResponse")


@_attrs_define
class TaskCompleteResponse:
  """
  Attributes:
      completed_task (TaskSchema):
      next_task (None | TaskSchema | Unset): Next recurring instance, if applicable.
  """

  completed_task: TaskSchema
  next_task: None | TaskSchema | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.task_schema import TaskSchema

    completed_task = self.completed_task.to_dict()

    next_task: dict[str, Any] | None | Unset
    if isinstance(self.next_task, Unset):
      next_task = UNSET
    elif isinstance(self.next_task, TaskSchema):
      next_task = self.next_task.to_dict()
    else:
      next_task = self.next_task

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "completed_task": completed_task,
      }
    )
    if next_task is not UNSET:
      field_dict["next_task"] = next_task

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.task_schema import TaskSchema

    d = dict(src_dict)
    completed_task = TaskSchema.from_dict(d.pop("completed_task"))

    def _parse_next_task(data: object) -> None | TaskSchema | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        next_task_type_0 = TaskSchema.from_dict(data)

        return next_task_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | TaskSchema | Unset, data)

    next_task = _parse_next_task(d.pop("next_task", UNSET))

    task_complete_response = cls(
      completed_task=completed_task,
      next_task=next_task,
    )

    task_complete_response.additional_properties = d
    return task_complete_response

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
