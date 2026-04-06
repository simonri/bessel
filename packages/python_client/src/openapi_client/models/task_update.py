from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.rrule_frequency import RruleFrequency
from ..models.task_status import TaskStatus
from ..types import UNSET, Unset

T = TypeVar("T", bound="TaskUpdate")


@_attrs_define
class TaskUpdate:
  """
  Attributes:
      title (None | str | Unset):
      description (None | str | Unset):
      status (None | TaskStatus | Unset):
      priority (int | None | Unset):
      due_date (datetime.date | None | Unset):
      project (None | str | Unset):
      area (None | str | Unset):
      tags (list[str] | None | Unset):
      position (float | None | Unset):
      is_recurring (bool | None | Unset):
      rrule_frequency (None | RruleFrequency | Unset):
      rrule_interval (int | None | Unset):
      rrule_day_of_week (int | None | Unset):
      rrule_day_of_month (int | None | Unset):
  """

  title: None | str | Unset = UNSET
  description: None | str | Unset = UNSET
  status: None | TaskStatus | Unset = UNSET
  priority: int | None | Unset = UNSET
  due_date: datetime.date | None | Unset = UNSET
  project: None | str | Unset = UNSET
  area: None | str | Unset = UNSET
  tags: list[str] | None | Unset = UNSET
  position: float | None | Unset = UNSET
  is_recurring: bool | None | Unset = UNSET
  rrule_frequency: None | RruleFrequency | Unset = UNSET
  rrule_interval: int | None | Unset = UNSET
  rrule_day_of_week: int | None | Unset = UNSET
  rrule_day_of_month: int | None | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    title: None | str | Unset
    if isinstance(self.title, Unset):
      title = UNSET
    else:
      title = self.title

    description: None | str | Unset
    if isinstance(self.description, Unset):
      description = UNSET
    else:
      description = self.description

    status: None | str | Unset
    if isinstance(self.status, Unset):
      status = UNSET
    elif isinstance(self.status, TaskStatus):
      status = self.status.value
    else:
      status = self.status

    priority: int | None | Unset
    if isinstance(self.priority, Unset):
      priority = UNSET
    else:
      priority = self.priority

    due_date: None | str | Unset
    if isinstance(self.due_date, Unset):
      due_date = UNSET
    elif isinstance(self.due_date, datetime.date):
      due_date = self.due_date.isoformat()
    else:
      due_date = self.due_date

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

    position: float | None | Unset
    if isinstance(self.position, Unset):
      position = UNSET
    else:
      position = self.position

    is_recurring: bool | None | Unset
    if isinstance(self.is_recurring, Unset):
      is_recurring = UNSET
    else:
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

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if title is not UNSET:
      field_dict["title"] = title
    if description is not UNSET:
      field_dict["description"] = description
    if status is not UNSET:
      field_dict["status"] = status
    if priority is not UNSET:
      field_dict["priority"] = priority
    if due_date is not UNSET:
      field_dict["due_date"] = due_date
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

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_title(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    title = _parse_title(d.pop("title", UNSET))

    def _parse_description(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    description = _parse_description(d.pop("description", UNSET))

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

    def _parse_priority(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    priority = _parse_priority(d.pop("priority", UNSET))

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

    def _parse_position(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    position = _parse_position(d.pop("position", UNSET))

    def _parse_is_recurring(data: object) -> bool | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(bool | None | Unset, data)

    is_recurring = _parse_is_recurring(d.pop("is_recurring", UNSET))

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

    task_update = cls(
      title=title,
      description=description,
      status=status,
      priority=priority,
      due_date=due_date,
      project=project,
      area=area,
      tags=tags,
      position=position,
      is_recurring=is_recurring,
      rrule_frequency=rrule_frequency,
      rrule_interval=rrule_interval,
      rrule_day_of_week=rrule_day_of_week,
      rrule_day_of_month=rrule_day_of_month,
    )

    task_update.additional_properties = d
    return task_update

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
