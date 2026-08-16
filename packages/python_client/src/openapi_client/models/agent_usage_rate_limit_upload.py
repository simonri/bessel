from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="AgentUsageRateLimitUpload")


@_attrs_define
class AgentUsageRateLimitUpload:
  """
  Attributes:
      device (str):
      agent (str):
      window_label (str): e.g. 'session_5h', 'week'.
      utilization_pct (float):
      resets_at (datetime.datetime | None | Unset):
      tier (None | str | Unset):
  """

  device: str
  agent: str
  window_label: str
  utilization_pct: float
  resets_at: datetime.datetime | None | Unset = UNSET
  tier: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    device = self.device

    agent = self.agent

    window_label = self.window_label

    utilization_pct = self.utilization_pct

    resets_at: None | str | Unset
    if isinstance(self.resets_at, Unset):
      resets_at = UNSET
    elif isinstance(self.resets_at, datetime.datetime):
      resets_at = self.resets_at.isoformat()
    else:
      resets_at = self.resets_at

    tier: None | str | Unset
    if isinstance(self.tier, Unset):
      tier = UNSET
    else:
      tier = self.tier

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "device": device,
        "agent": agent,
        "window_label": window_label,
        "utilization_pct": utilization_pct,
      }
    )
    if resets_at is not UNSET:
      field_dict["resets_at"] = resets_at
    if tier is not UNSET:
      field_dict["tier"] = tier

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    device = d.pop("device")

    agent = d.pop("agent")

    window_label = d.pop("window_label")

    utilization_pct = d.pop("utilization_pct")

    def _parse_resets_at(data: object) -> datetime.datetime | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        resets_at_type_0 = datetime.datetime.fromisoformat(data)

        return resets_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None | Unset, data)

    resets_at = _parse_resets_at(d.pop("resets_at", UNSET))

    def _parse_tier(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    tier = _parse_tier(d.pop("tier", UNSET))

    agent_usage_rate_limit_upload = cls(
      device=device,
      agent=agent,
      window_label=window_label,
      utilization_pct=utilization_pct,
      resets_at=resets_at,
      tier=tier,
    )

    agent_usage_rate_limit_upload.additional_properties = d
    return agent_usage_rate_limit_upload

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
