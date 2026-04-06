from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.asset_type import AssetType
from ..types import UNSET, Unset

T = TypeVar("T", bound="SecurityUpdate")


@_attrs_define
class SecurityUpdate:
  """
  Attributes:
      name (None | str | Unset):
      ticker (None | str | Unset):
      asset_type (AssetType | None | Unset):
      currency (None | str | Unset):
      notes (None | str | Unset):
  """

  name: None | str | Unset = UNSET
  ticker: None | str | Unset = UNSET
  asset_type: AssetType | None | Unset = UNSET
  currency: None | str | Unset = UNSET
  notes: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    name: None | str | Unset
    if isinstance(self.name, Unset):
      name = UNSET
    else:
      name = self.name

    ticker: None | str | Unset
    if isinstance(self.ticker, Unset):
      ticker = UNSET
    else:
      ticker = self.ticker

    asset_type: None | str | Unset
    if isinstance(self.asset_type, Unset):
      asset_type = UNSET
    elif isinstance(self.asset_type, AssetType):
      asset_type = self.asset_type.value
    else:
      asset_type = self.asset_type

    currency: None | str | Unset
    if isinstance(self.currency, Unset):
      currency = UNSET
    else:
      currency = self.currency

    notes: None | str | Unset
    if isinstance(self.notes, Unset):
      notes = UNSET
    else:
      notes = self.notes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if name is not UNSET:
      field_dict["name"] = name
    if ticker is not UNSET:
      field_dict["ticker"] = ticker
    if asset_type is not UNSET:
      field_dict["asset_type"] = asset_type
    if currency is not UNSET:
      field_dict["currency"] = currency
    if notes is not UNSET:
      field_dict["notes"] = notes

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

    def _parse_ticker(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    ticker = _parse_ticker(d.pop("ticker", UNSET))

    def _parse_asset_type(data: object) -> AssetType | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        asset_type_type_0 = AssetType(data)

        return asset_type_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(AssetType | None | Unset, data)

    asset_type = _parse_asset_type(d.pop("asset_type", UNSET))

    def _parse_currency(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    currency = _parse_currency(d.pop("currency", UNSET))

    def _parse_notes(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    notes = _parse_notes(d.pop("notes", UNSET))

    security_update = cls(
      name=name,
      ticker=ticker,
      asset_type=asset_type,
      currency=currency,
      notes=notes,
    )

    security_update.additional_properties = d
    return security_update

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
