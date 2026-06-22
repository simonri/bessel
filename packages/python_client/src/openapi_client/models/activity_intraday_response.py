from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.activity_intraday_bucket import ActivityIntradayBucket


T = TypeVar("T", bound="ActivityIntradayResponse")


@_attrs_define
class ActivityIntradayResponse:
  """
  Attributes:
      bucket_mins (int): Duration of each bucket in minutes.
      total_buckets (int): Total number of buckets covering the requested window.
      buckets (list[ActivityIntradayBucket]): Buckets with activity, sorted ascending. Buckets with no activity are
          omitted.
  """

  bucket_mins: int
  total_buckets: int
  buckets: list[ActivityIntradayBucket]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    bucket_mins = self.bucket_mins

    total_buckets = self.total_buckets

    buckets = []
    for buckets_item_data in self.buckets:
      buckets_item = buckets_item_data.to_dict()
      buckets.append(buckets_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "bucket_mins": bucket_mins,
        "total_buckets": total_buckets,
        "buckets": buckets,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.activity_intraday_bucket import ActivityIntradayBucket

    d = dict(src_dict)
    bucket_mins = d.pop("bucket_mins")

    total_buckets = d.pop("total_buckets")

    buckets = []
    _buckets = d.pop("buckets")
    for buckets_item_data in _buckets:
      buckets_item = ActivityIntradayBucket.from_dict(buckets_item_data)

      buckets.append(buckets_item)

    activity_intraday_response = cls(
      bucket_mins=bucket_mins,
      total_buckets=total_buckets,
      buckets=buckets,
    )

    activity_intraday_response.additional_properties = d
    return activity_intraday_response

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
