from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="TimeProjectUpdate")


@_attrs_define
class TimeProjectUpdate:
  """
  Attributes:
      name (None | str | Unset):
      client (None | str | Unset):
      color (None | str | Unset):
      hourly_rate (float | None | Unset):
      currency (None | str | Unset):
      archived (bool | None | Unset):
  """

  name: None | str | Unset = UNSET
  client: None | str | Unset = UNSET
  color: None | str | Unset = UNSET
  hourly_rate: float | None | Unset = UNSET
  currency: None | str | Unset = UNSET
  archived: bool | None | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    name: None | str | Unset
    if isinstance(self.name, Unset):
      name = UNSET
    else:
      name = self.name

    client: None | str | Unset
    if isinstance(self.client, Unset):
      client = UNSET
    else:
      client = self.client

    color: None | str | Unset
    if isinstance(self.color, Unset):
      color = UNSET
    else:
      color = self.color

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

    archived: bool | None | Unset
    if isinstance(self.archived, Unset):
      archived = UNSET
    else:
      archived = self.archived

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if name is not UNSET:
      field_dict["name"] = name
    if client is not UNSET:
      field_dict["client"] = client
    if color is not UNSET:
      field_dict["color"] = color
    if hourly_rate is not UNSET:
      field_dict["hourly_rate"] = hourly_rate
    if currency is not UNSET:
      field_dict["currency"] = currency
    if archived is not UNSET:
      field_dict["archived"] = archived

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_name(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    name = _parse_name(d.pop("name", UNSET))

    def _parse_client(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    client = _parse_client(d.pop("client", UNSET))

    def _parse_color(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    color = _parse_color(d.pop("color", UNSET))

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

    def _parse_archived(data: object) -> bool | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(bool | None | Unset, data)

    archived = _parse_archived(d.pop("archived", UNSET))

    time_project_update = cls(
      name=name,
      client=client,
      color=color,
      hourly_rate=hourly_rate,
      currency=currency,
      archived=archived,
    )

    time_project_update.additional_properties = d
    return time_project_update

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
