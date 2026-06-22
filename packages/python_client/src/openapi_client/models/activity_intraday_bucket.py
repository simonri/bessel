from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="ActivityIntradayBucket")


@_attrs_define
class ActivityIntradayBucket:
  """
  Attributes:
      bucket (int): Bucket index from midnight (0-based). Each bucket spans bucket_mins minutes.
      active_secs (int): Total active seconds in this bucket.
  """

  bucket: int
  active_secs: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    bucket = self.bucket

    active_secs = self.active_secs

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "bucket": bucket,
        "active_secs": active_secs,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    bucket = d.pop("bucket")

    active_secs = d.pop("active_secs")

    activity_intraday_bucket = cls(
      bucket=bucket,
      active_secs=active_secs,
    )

    activity_intraday_bucket.additional_properties = d
    return activity_intraday_bucket

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
