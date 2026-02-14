from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="BankAccountCreate")


@_attrs_define
class BankAccountCreate:
  """
  Attributes:
      name (str): Display name of the bank account.
      currency (str): ISO 4217 currency code.
      subtype (str): Account subtype, e.g. 'checking', 'savings'.
      base_balance (int | Unset): Starting balance in minor units (cents). Default: 0.
  """

  name: str
  currency: str
  subtype: str
  base_balance: int | Unset = 0
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    name = self.name

    currency = self.currency

    subtype = self.subtype

    base_balance = self.base_balance

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "name": name,
        "currency": currency,
        "subtype": subtype,
      }
    )
    if base_balance is not UNSET:
      field_dict["base_balance"] = base_balance

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    name = d.pop("name")

    currency = d.pop("currency")

    subtype = d.pop("subtype")

    base_balance = d.pop("base_balance", UNSET)

    bank_account_create = cls(
      name=name,
      currency=currency,
      subtype=subtype,
      base_balance=base_balance,
    )

    bank_account_create.additional_properties = d
    return bank_account_create

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
