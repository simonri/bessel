from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.agent_usage_daily_upload import AgentUsageDailyUpload
  from ..models.agent_usage_rate_limit_upload import AgentUsageRateLimitUpload


T = TypeVar("T", bound="AgentUsageSyncRequest")


@_attrs_define
class AgentUsageSyncRequest:
  """
  Attributes:
      daily (list[AgentUsageDailyUpload] | Unset):
      rate_limits (list[AgentUsageRateLimitUpload] | Unset):
  """

  daily: list[AgentUsageDailyUpload] | Unset = UNSET
  rate_limits: list[AgentUsageRateLimitUpload] | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    daily: list[dict[str, Any]] | Unset = UNSET
    if not isinstance(self.daily, Unset):
      daily = []
      for daily_item_data in self.daily:
        daily_item = daily_item_data.to_dict()
        daily.append(daily_item)

    rate_limits: list[dict[str, Any]] | Unset = UNSET
    if not isinstance(self.rate_limits, Unset):
      rate_limits = []
      for rate_limits_item_data in self.rate_limits:
        rate_limits_item = rate_limits_item_data.to_dict()
        rate_limits.append(rate_limits_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if daily is not UNSET:
      field_dict["daily"] = daily
    if rate_limits is not UNSET:
      field_dict["rate_limits"] = rate_limits

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.agent_usage_daily_upload import AgentUsageDailyUpload
    from ..models.agent_usage_rate_limit_upload import AgentUsageRateLimitUpload

    d = dict(src_dict)
    _daily = d.pop("daily", UNSET)
    daily: list[AgentUsageDailyUpload] | Unset = UNSET
    if _daily is not UNSET:
      daily = []
      for daily_item_data in _daily:
        daily_item = AgentUsageDailyUpload.from_dict(daily_item_data)

        daily.append(daily_item)

    _rate_limits = d.pop("rate_limits", UNSET)
    rate_limits: list[AgentUsageRateLimitUpload] | Unset = UNSET
    if _rate_limits is not UNSET:
      rate_limits = []
      for rate_limits_item_data in _rate_limits:
        rate_limits_item = AgentUsageRateLimitUpload.from_dict(rate_limits_item_data)

        rate_limits.append(rate_limits_item)

    agent_usage_sync_request = cls(
      daily=daily,
      rate_limits=rate_limits,
    )

    agent_usage_sync_request.additional_properties = d
    return agent_usage_sync_request

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
