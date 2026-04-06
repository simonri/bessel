from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.rrule_frequency import RruleFrequency
from ..models.task_status import TaskStatus
from ..types import UNSET, Unset

T = TypeVar("T", bound="TaskSchema")


@_attrs_define
class TaskSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      title (str): Task title.
      description (None | str | Unset): Task description.
      status (TaskStatus | Unset):
      priority (int | Unset): Priority (0=none, 1=low, 2=medium, 3=high, 4=urgent). Default: 0.
      due_date (datetime.date | None | Unset): Due date.
      completed_at (datetime.datetime | None | Unset): Completion timestamp.
      project (None | str | Unset): Project name.
      area (None | str | Unset): Area (e.g. Company, Personal, Travel).
      tags (list[str] | None | Unset): User-defined tags.
      position (float | Unset): Position for ordering within a status column. Default: 0.0.
      is_recurring (bool | Unset): Whether this task recurs. Default: False.
      rrule_frequency (None | RruleFrequency | Unset): Recurrence frequency.
      rrule_interval (int | None | Unset): Recurrence interval.
      rrule_day_of_week (int | None | Unset): Day of week for weekly recurrence (0=Mon, 6=Sun).
      rrule_day_of_month (int | None | Unset): Day of month for monthly recurrence (1-31).
      parent_task_id (None | Unset | UUID): Parent task ID for recurring chain.
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  title: str
  description: None | str | Unset = UNSET
  status: TaskStatus | Unset = UNSET
  priority: int | Unset = 0
  due_date: datetime.date | None | Unset = UNSET
  completed_at: datetime.datetime | None | Unset = UNSET
  project: None | str | Unset = UNSET
  area: None | str | Unset = UNSET
  tags: list[str] | None | Unset = UNSET
  position: float | Unset = 0.0
  is_recurring: bool | Unset = False
  rrule_frequency: None | RruleFrequency | Unset = UNSET
  rrule_interval: int | None | Unset = UNSET
  rrule_day_of_week: int | None | Unset = UNSET
  rrule_day_of_month: int | None | Unset = UNSET
  parent_task_id: None | Unset | UUID = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    title = self.title

    description: None | str | Unset
    if isinstance(self.description, Unset):
      description = UNSET
    else:
      description = self.description

    status: str | Unset = UNSET
    if not isinstance(self.status, Unset):
      status = self.status.value

    priority = self.priority

    due_date: None | str | Unset
    if isinstance(self.due_date, Unset):
      due_date = UNSET
    elif isinstance(self.due_date, datetime.date):
      due_date = self.due_date.isoformat()
    else:
      due_date = self.due_date

    completed_at: None | str | Unset
    if isinstance(self.completed_at, Unset):
      completed_at = UNSET
    elif isinstance(self.completed_at, datetime.datetime):
      completed_at = self.completed_at.isoformat()
    else:
      completed_at = self.completed_at

    project: None | str | Unset
    if isinstance(self.project, Unset):
      project = UNSET
    else:
      project = self.project

    area: None | str | Unset
    if isinstance(self.area, Unset):
      area = UNSET
    else:
      area = self.area

    tags: list[str] | None | Unset
    if isinstance(self.tags, Unset):
      tags = UNSET
    elif isinstance(self.tags, list):
      tags = self.tags

    else:
      tags = self.tags

    position = self.position

    is_recurring = self.is_recurring

    rrule_frequency: None | str | Unset
    if isinstance(self.rrule_frequency, Unset):
      rrule_frequency = UNSET
    elif isinstance(self.rrule_frequency, RruleFrequency):
      rrule_frequency = self.rrule_frequency.value
    else:
      rrule_frequency = self.rrule_frequency

    rrule_interval: int | None | Unset
    if isinstance(self.rrule_interval, Unset):
      rrule_interval = UNSET
    else:
      rrule_interval = self.rrule_interval

    rrule_day_of_week: int | None | Unset
    if isinstance(self.rrule_day_of_week, Unset):
      rrule_day_of_week = UNSET
    else:
      rrule_day_of_week = self.rrule_day_of_week

    rrule_day_of_month: int | None | Unset
    if isinstance(self.rrule_day_of_month, Unset):
      rrule_day_of_month = UNSET
    else:
      rrule_day_of_month = self.rrule_day_of_month

    parent_task_id: None | str | Unset
    if isinstance(self.parent_task_id, Unset):
      parent_task_id = UNSET
    elif isinstance(self.parent_task_id, UUID):
      parent_task_id = str(self.parent_task_id)
    else:
      parent_task_id = self.parent_task_id

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "title": title,
      }
    )
    if description is not UNSET:
      field_dict["description"] = description
    if status is not UNSET:
      field_dict["status"] = status
    if priority is not UNSET:
      field_dict["priority"] = priority
    if due_date is not UNSET:
      field_dict["due_date"] = due_date
    if completed_at is not UNSET:
      field_dict["completed_at"] = completed_at
    if project is not UNSET:
      field_dict["project"] = project
    if area is not UNSET:
      field_dict["area"] = area
    if tags is not UNSET:
      field_dict["tags"] = tags
    if position is not UNSET:
      field_dict["position"] = position
    if is_recurring is not UNSET:
      field_dict["is_recurring"] = is_recurring
    if rrule_frequency is not UNSET:
      field_dict["rrule_frequency"] = rrule_frequency
    if rrule_interval is not UNSET:
      field_dict["rrule_interval"] = rrule_interval
    if rrule_day_of_week is not UNSET:
      field_dict["rrule_day_of_week"] = rrule_day_of_week
    if rrule_day_of_month is not UNSET:
      field_dict["rrule_day_of_month"] = rrule_day_of_month
    if parent_task_id is not UNSET:
      field_dict["parent_task_id"] = parent_task_id

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    created_at = isoparse(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = isoparse(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    title = d.pop("title")

    def _parse_description(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    description = _parse_description(d.pop("description", UNSET))

    _status = d.pop("status", UNSET)
    status: TaskStatus | Unset
    if isinstance(_status, Unset):
      status = UNSET
    else:
      status = TaskStatus(_status)

    priority = d.pop("priority", UNSET)

    def _parse_due_date(data: object) -> datetime.date | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        due_date_type_0 = isoparse(data).date()

        return due_date_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.date | None | Unset, data)

    due_date = _parse_due_date(d.pop("due_date", UNSET))

    def _parse_completed_at(data: object) -> datetime.datetime | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        completed_at_type_0 = isoparse(data)

        return completed_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None | Unset, data)

    completed_at = _parse_completed_at(d.pop("completed_at", UNSET))

    def _parse_project(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    project = _parse_project(d.pop("project", UNSET))

    def _parse_area(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    area = _parse_area(d.pop("area", UNSET))

    def _parse_tags(data: object) -> list[str] | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, list):
          raise TypeError()
        tags_type_0 = cast(list[str], data)

        return tags_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(list[str] | None | Unset, data)

    tags = _parse_tags(d.pop("tags", UNSET))

    position = d.pop("position", UNSET)

    is_recurring = d.pop("is_recurring", UNSET)

    def _parse_rrule_frequency(data: object) -> None | RruleFrequency | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        rrule_frequency_type_0 = RruleFrequency(data)

        return rrule_frequency_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | RruleFrequency | Unset, data)

    rrule_frequency = _parse_rrule_frequency(d.pop("rrule_frequency", UNSET))

    def _parse_rrule_interval(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    rrule_interval = _parse_rrule_interval(d.pop("rrule_interval", UNSET))

    def _parse_rrule_day_of_week(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    rrule_day_of_week = _parse_rrule_day_of_week(d.pop("rrule_day_of_week", UNSET))

    def _parse_rrule_day_of_month(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    rrule_day_of_month = _parse_rrule_day_of_month(d.pop("rrule_day_of_month", UNSET))

    def _parse_parent_task_id(data: object) -> None | Unset | UUID:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        parent_task_id_type_0 = UUID(data)

        return parent_task_id_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | Unset | UUID, data)

    parent_task_id = _parse_parent_task_id(d.pop("parent_task_id", UNSET))

    task_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      title=title,
      description=description,
      status=status,
      priority=priority,
      due_date=due_date,
      completed_at=completed_at,
      project=project,
      area=area,
      tags=tags,
      position=position,
      is_recurring=is_recurring,
      rrule_frequency=rrule_frequency,
      rrule_interval=rrule_interval,
      rrule_day_of_week=rrule_day_of_week,
      rrule_day_of_month=rrule_day_of_month,
      parent_task_id=parent_task_id,
    )

    task_schema.additional_properties = d
    return task_schema

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
