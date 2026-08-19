from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="TaskAttachmentSchema")


@_attrs_define
class TaskAttachmentSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      task_id (UUID): ID of the task this attachment belongs to.
      filename (str): Original filename.
      content_type (str): MIME type of the file.
      size_bytes (int): File size in bytes.
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  task_id: UUID
  filename: str
  content_type: str
  size_bytes: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    task_id = str(self.task_id)

    filename = self.filename

    content_type = self.content_type

    size_bytes = self.size_bytes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "task_id": task_id,
        "filename": filename,
        "content_type": content_type,
        "size_bytes": size_bytes,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
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

    task_id = UUID(d.pop("task_id"))

    filename = d.pop("filename")

    content_type = d.pop("content_type")

    size_bytes = d.pop("size_bytes")

    task_attachment_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      task_id=task_id,
      filename=filename,
      content_type=content_type,
      size_bytes=size_bytes,
    )

    task_attachment_schema.additional_properties = d
    return task_attachment_schema

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
