from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="AgentUsageSyncResponse")


@_attrs_define
class AgentUsageSyncResponse:
  """
  Attributes:
      daily_synced (int): Number of (device, agent, date, model) rows inserted or updated.
      status_synced (int): Number of (device, agent, window_label) rows inserted or updated.
  """

  daily_synced: int
  status_synced: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    daily_synced = self.daily_synced

    status_synced = self.status_synced

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "daily_synced": daily_synced,
        "status_synced": status_synced,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    daily_synced = d.pop("daily_synced")

    status_synced = d.pop("status_synced")

    agent_usage_sync_response = cls(
      daily_synced=daily_synced,
      status_synced=status_synced,
    )

    agent_usage_sync_response.additional_properties = d
    return agent_usage_sync_response

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
