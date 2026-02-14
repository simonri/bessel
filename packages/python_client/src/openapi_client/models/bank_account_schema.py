from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

T = TypeVar("T", bound="BankAccountSchema")


@_attrs_define
class BankAccountSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      name (str): Display name of the bank account.
      currency (str): ISO 4217 currency code.
      base_balance (int): Starting balance in minor units (cents).
      subtype (str): Account subtype, e.g. 'checking', 'savings'.
      current_balance (int): Current balance in minor units (base_balance + credits - debits).
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  name: str
  currency: str
  base_balance: int
  subtype: str
  current_balance: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    name = self.name

    currency = self.currency

    base_balance = self.base_balance

    subtype = self.subtype

    current_balance = self.current_balance

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "name": name,
        "currency": currency,
        "base_balance": base_balance,
        "subtype": subtype,
        "current_balance": current_balance,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    created_at = isoparse(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = isoparse(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    name = d.pop("name")

    currency = d.pop("currency")

    base_balance = d.pop("base_balance")

    subtype = d.pop("subtype")

    current_balance = d.pop("current_balance")

    bank_account_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      name=name,
      currency=currency,
      base_balance=base_balance,
      subtype=subtype,
      current_balance=current_balance,
    )

    bank_account_schema.additional_properties = d
    return bank_account_schema

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
