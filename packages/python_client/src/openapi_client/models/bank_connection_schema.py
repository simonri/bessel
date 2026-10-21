from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.bank_connection_account_schema import BankConnectionAccountSchema


T = TypeVar("T", bound="BankConnectionSchema")


@_attrs_define
class BankConnectionSchema:
  """
  Attributes:
      id (UUID):
      bank_name (str):
      valid_until (datetime.datetime): When the bank approval ends; renew it with BankID before then.
      last_synced_at (datetime.datetime | None):
      sync_error (None | str):
      accounts (list[BankConnectionAccountSchema]):
  """

  id: UUID
  bank_name: str
  valid_until: datetime.datetime
  last_synced_at: datetime.datetime | None
  sync_error: None | str
  accounts: list[BankConnectionAccountSchema]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    bank_name = self.bank_name

    valid_until = self.valid_until.isoformat()

    last_synced_at: None | str
    if isinstance(self.last_synced_at, datetime.datetime):
      last_synced_at = self.last_synced_at.isoformat()
    else:
      last_synced_at = self.last_synced_at

    sync_error: None | str
    sync_error = self.sync_error

    accounts = []
    for accounts_item_data in self.accounts:
      accounts_item = accounts_item_data.to_dict()
      accounts.append(accounts_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "bank_name": bank_name,
        "valid_until": valid_until,
        "last_synced_at": last_synced_at,
        "sync_error": sync_error,
        "accounts": accounts,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.bank_connection_account_schema import BankConnectionAccountSchema

    d = dict(src_dict)
    id = UUID(d.pop("id"))

    bank_name = d.pop("bank_name")

    valid_until = datetime.datetime.fromisoformat(d.pop("valid_until"))

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

    def _parse_sync_error(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    sync_error = _parse_sync_error(d.pop("sync_error"))

    accounts = []
    _accounts = d.pop("accounts")
    for accounts_item_data in _accounts:
      accounts_item = BankConnectionAccountSchema.from_dict(accounts_item_data)

      accounts.append(accounts_item)

    bank_connection_schema = cls(
      id=id,
      bank_name=bank_name,
      valid_until=valid_until,
      last_synced_at=last_synced_at,
      sync_error=sync_error,
      accounts=accounts,
    )

    bank_connection_schema.additional_properties = d
    return bank_connection_schema

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
