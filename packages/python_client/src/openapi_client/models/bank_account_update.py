from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="BankAccountUpdate")


@_attrs_define
class BankAccountUpdate:
  """
  Attributes:
      name (None | str | Unset): Display name of the bank account.
      currency (None | str | Unset): ISO 4217 currency code.
      base_balance (int | None | Unset): Starting balance in minor units (cents).
      subtype (None | str | Unset): Account subtype, e.g. 'checking', 'savings'.
  """

  name: None | str | Unset = UNSET
  currency: None | str | Unset = UNSET
  base_balance: int | None | Unset = UNSET
  subtype: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    name: None | str | Unset
    if isinstance(self.name, Unset):
      name = UNSET
    else:
      name = self.name

    currency: None | str | Unset
    if isinstance(self.currency, Unset):
      currency = UNSET
    else:
      currency = self.currency

    base_balance: int | None | Unset
    if isinstance(self.base_balance, Unset):
      base_balance = UNSET
    else:
      base_balance = self.base_balance

    subtype: None | str | Unset
    if isinstance(self.subtype, Unset):
      subtype = UNSET
    else:
      subtype = self.subtype

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if name is not UNSET:
      field_dict["name"] = name
    if currency is not UNSET:
      field_dict["currency"] = currency
    if base_balance is not UNSET:
      field_dict["base_balance"] = base_balance
    if subtype is not UNSET:
      field_dict["subtype"] = subtype

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

    def _parse_currency(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    currency = _parse_currency(d.pop("currency", UNSET))

    def _parse_base_balance(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    base_balance = _parse_base_balance(d.pop("base_balance", UNSET))

    def _parse_subtype(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    subtype = _parse_subtype(d.pop("subtype", UNSET))

    bank_account_update = cls(
      name=name,
      currency=currency,
      base_balance=base_balance,
      subtype=subtype,
    )

    bank_account_update.additional_properties = d
    return bank_account_update

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
