from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="AvanzaAccountSchema")


@_attrs_define
class AvanzaAccountSchema:
  """
  Attributes:
      id (UUID):
      name (str):
      account_type (str): Avanza's account type, e.g. 'INVESTERINGSSPARKONTO'.
      bank_account_id (None | UUID): The Bessel account it imports into; nothing is imported until one is chosen.
      cash_balance (int | None): Cash in the account as Avanza reports it, in minor units.
      last_synced_at (datetime.datetime | None):
  """

  id: UUID
  name: str
  account_type: str
  bank_account_id: None | UUID
  cash_balance: int | None
  last_synced_at: datetime.datetime | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    name = self.name

    account_type = self.account_type

    bank_account_id: None | str
    if isinstance(self.bank_account_id, UUID):
      bank_account_id = str(self.bank_account_id)
    else:
      bank_account_id = self.bank_account_id

    cash_balance: int | None
    cash_balance = self.cash_balance

    last_synced_at: None | str
    if isinstance(self.last_synced_at, datetime.datetime):
      last_synced_at = self.last_synced_at.isoformat()
    else:
      last_synced_at = self.last_synced_at

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "name": name,
        "account_type": account_type,
        "bank_account_id": bank_account_id,
        "cash_balance": cash_balance,
        "last_synced_at": last_synced_at,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    id = UUID(d.pop("id"))

    name = d.pop("name")

    account_type = d.pop("account_type")

    def _parse_bank_account_id(data: object) -> None | UUID:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        bank_account_id_type_0 = UUID(data)

        return bank_account_id_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | UUID, data)

    bank_account_id = _parse_bank_account_id(d.pop("bank_account_id"))

    def _parse_cash_balance(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    cash_balance = _parse_cash_balance(d.pop("cash_balance"))

    def _parse_last_synced_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        last_synced_at_type_0 = datetime.datetime.fromisoformat(data)

        return last_synced_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    last_synced_at = _parse_last_synced_at(d.pop("last_synced_at"))

    avanza_account_schema = cls(
      id=id,
      name=name,
      account_type=account_type,
      bank_account_id=bank_account_id,
      cash_balance=cash_balance,
      last_synced_at=last_synced_at,
    )

    avanza_account_schema.additional_properties = d
    return avanza_account_schema

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
