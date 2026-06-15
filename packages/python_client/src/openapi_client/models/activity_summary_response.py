from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.activity_app_summary import ActivityAppSummary


T = TypeVar("T", bound="ActivitySummaryResponse")


@_attrs_define
class ActivitySummaryResponse:
  """
  Attributes:
      source (str): Machine source that was queried.
      sources (list[str]): All known machine sources, ordered by most recent activity.
      total_active_secs (int): Total active seconds in the requested time window.
      apps (list[ActivityAppSummary]): Per-app breakdown, sorted by active time descending.
  """

  source: str
  sources: list[str]
  total_active_secs: int
  apps: list[ActivityAppSummary]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    source = self.source

    sources = self.sources

    total_active_secs = self.total_active_secs

    apps = []
    for apps_item_data in self.apps:
      apps_item = apps_item_data.to_dict()
      apps.append(apps_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "source": source,
        "sources": sources,
        "total_active_secs": total_active_secs,
        "apps": apps,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.activity_app_summary import ActivityAppSummary

    d = dict(src_dict)
    source = d.pop("source")

    sources = cast(list[str], d.pop("sources"))

    total_active_secs = d.pop("total_active_secs")

    apps = []
    _apps = d.pop("apps")
    for apps_item_data in _apps:
      apps_item = ActivityAppSummary.from_dict(apps_item_data)

      apps.append(apps_item)

    activity_summary_response = cls(
      source=source,
      sources=sources,
      total_active_secs=total_active_secs,
      apps=apps,
    )

    activity_summary_response.additional_properties = d
    return activity_summary_response

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
