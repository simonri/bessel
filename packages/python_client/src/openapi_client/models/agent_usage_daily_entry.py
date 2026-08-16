from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="AgentUsageDailyEntry")


@_attrs_define
class AgentUsageDailyEntry:
  """
  Attributes:
      date (str): ISO date string (YYYY-MM-DD).
      device (str):
      agent (str):
      model (str):
      input_tokens (int):
      output_tokens (int):
      cache_read_tokens (int):
      cache_creation_tokens (int):
  """

  date: str
  device: str
  agent: str
  model: str
  input_tokens: int
  output_tokens: int
  cache_read_tokens: int
  cache_creation_tokens: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    date = self.date

    device = self.device

    agent = self.agent

    model = self.model

    input_tokens = self.input_tokens

    output_tokens = self.output_tokens

    cache_read_tokens = self.cache_read_tokens

    cache_creation_tokens = self.cache_creation_tokens

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "date": date,
        "device": device,
        "agent": agent,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cache_read_tokens": cache_read_tokens,
        "cache_creation_tokens": cache_creation_tokens,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    date = d.pop("date")

    device = d.pop("device")

    agent = d.pop("agent")

    model = d.pop("model")

    input_tokens = d.pop("input_tokens")

    output_tokens = d.pop("output_tokens")

    cache_read_tokens = d.pop("cache_read_tokens")

    cache_creation_tokens = d.pop("cache_creation_tokens")

    agent_usage_daily_entry = cls(
      date=date,
      device=device,
      agent=agent,
      model=model,
      input_tokens=input_tokens,
      output_tokens=output_tokens,
      cache_read_tokens=cache_read_tokens,
      cache_creation_tokens=cache_creation_tokens,
    )

    agent_usage_daily_entry.additional_properties = d
    return agent_usage_daily_entry

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
