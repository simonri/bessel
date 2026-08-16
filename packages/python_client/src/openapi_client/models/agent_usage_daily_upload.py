from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.agent_usage_model_tokens import AgentUsageModelTokens


T = TypeVar("T", bound="AgentUsageDailyUpload")


@_attrs_define
class AgentUsageDailyUpload:
  """
  Attributes:
      device (str): Machine identifier, e.g. hostname.
      agent (str): e.g. 'claude-code'.
      date (datetime.date): Collector's local calendar date.
      models (list[AgentUsageModelTokens]):
  """

  device: str
  agent: str
  date: datetime.date
  models: list[AgentUsageModelTokens]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    device = self.device

    agent = self.agent

    date = self.date.isoformat()

    models = []
    for models_item_data in self.models:
      models_item = models_item_data.to_dict()
      models.append(models_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "device": device,
        "agent": agent,
        "date": date,
        "models": models,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.agent_usage_model_tokens import AgentUsageModelTokens

    d = dict(src_dict)
    device = d.pop("device")

    agent = d.pop("agent")

    date = datetime.date.fromisoformat(d.pop("date"))

    models = []
    _models = d.pop("models")
    for models_item_data in _models:
      models_item = AgentUsageModelTokens.from_dict(models_item_data)

      models.append(models_item)

    agent_usage_daily_upload = cls(
      device=device,
      agent=agent,
      date=date,
      models=models,
    )

    agent_usage_daily_upload.additional_properties = d
    return agent_usage_daily_upload

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
