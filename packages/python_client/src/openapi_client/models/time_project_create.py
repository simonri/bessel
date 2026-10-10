from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="TimeProjectCreate")


@_attrs_define
class TimeProjectCreate:
  """
  Attributes:
      name (str):
      color (str):
      client (None | str | Unset):
      hourly_rate (float | None | Unset):
      currency (None | str | Unset):
  """

  name: str
  color: str
  client: None | str | Unset = UNSET
  hourly_rate: float | None | Unset = UNSET
  currency: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    name = self.name

    color = self.color

    client: None | str | Unset
    if isinstance(self.client, Unset):
      client = UNSET
    else:
      client = self.client

    hourly_rate: float | None | Unset
    if isinstance(self.hourly_rate, Unset):
      hourly_rate = UNSET
    else:
      hourly_rate = self.hourly_rate

    currency: None | str | Unset
    if isinstance(self.currency, Unset):
      currency = UNSET
    else:
      currency = self.currency

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "name": name,
        "color": color,
      }
    )
    if client is not UNSET:
      field_dict["client"] = client
    if hourly_rate is not UNSET:
      field_dict["hourly_rate"] = hourly_rate
    if currency is not UNSET:
      field_dict["currency"] = currency

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    name = d.pop("name")

    color = d.pop("color")

    def _parse_client(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    client = _parse_client(d.pop("client", UNSET))

    def _parse_hourly_rate(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    hourly_rate = _parse_hourly_rate(d.pop("hourly_rate", UNSET))

    def _parse_currency(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    currency = _parse_currency(d.pop("currency", UNSET))

    time_project_create = cls(
      name=name,
      color=color,
      client=client,
      hourly_rate=hourly_rate,
      currency=currency,
    )

    time_project_create.additional_properties = d
    return time_project_create

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
