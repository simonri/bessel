from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.asset_type import AssetType
from ..types import UNSET, Unset

T = TypeVar("T", bound="SecurityCreate")


@_attrs_define
class SecurityCreate:
  """
  Attributes:
      name (str):
      asset_type (AssetType):
      currency (str):
      ticker (None | str | Unset):
      notes (None | str | Unset):
  """

  name: str
  asset_type: AssetType
  currency: str
  ticker: None | str | Unset = UNSET
  notes: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    name = self.name

    asset_type = self.asset_type.value

    currency = self.currency

    ticker: None | str | Unset
    if isinstance(self.ticker, Unset):
      ticker = UNSET
    else:
      ticker = self.ticker

    notes: None | str | Unset
    if isinstance(self.notes, Unset):
      notes = UNSET
    else:
      notes = self.notes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "name": name,
        "asset_type": asset_type,
        "currency": currency,
      }
    )
    if ticker is not UNSET:
      field_dict["ticker"] = ticker
    if notes is not UNSET:
      field_dict["notes"] = notes

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    name = d.pop("name")

    asset_type = AssetType(d.pop("asset_type"))

    currency = d.pop("currency")

    def _parse_ticker(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    ticker = _parse_ticker(d.pop("ticker", UNSET))

    def _parse_notes(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    notes = _parse_notes(d.pop("notes", UNSET))

    security_create = cls(
      name=name,
      asset_type=asset_type,
      currency=currency,
      ticker=ticker,
      notes=notes,
    )

    security_create.additional_properties = d
    return security_create

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
