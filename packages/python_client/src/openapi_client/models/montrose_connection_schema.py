from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.montrose_account_schema import MontroseAccountSchema


T = TypeVar("T", bound="MontroseConnectionSchema")


@_attrs_define
class MontroseConnectionSchema:
  """
  Attributes:
      id (UUID):
      rejected (bool): Montrose no longer accepts the consent; syncing waits for a new BankID login.
      consent_expires_at (datetime.datetime): When the BankID consent runs out and has to be given again.
      last_synced_at (datetime.datetime | None):
      sync_error (None | str):
      accounts (list[MontroseAccountSchema]):
  """

  id: UUID
  rejected: bool
  consent_expires_at: datetime.datetime
  last_synced_at: datetime.datetime | None
  sync_error: None | str
  accounts: list[MontroseAccountSchema]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    rejected = self.rejected

    consent_expires_at = self.consent_expires_at.isoformat()

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
        "rejected": rejected,
        "consent_expires_at": consent_expires_at,
        "last_synced_at": last_synced_at,
        "sync_error": sync_error,
        "accounts": accounts,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.montrose_account_schema import MontroseAccountSchema

    d = dict(src_dict)
    id = UUID(d.pop("id"))

    rejected = d.pop("rejected")

    consent_expires_at = datetime.datetime.fromisoformat(d.pop("consent_expires_at"))

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
      accounts_item = MontroseAccountSchema.from_dict(accounts_item_data)

      accounts.append(accounts_item)

    montrose_connection_schema = cls(
      id=id,
      rejected=rejected,
      consent_expires_at=consent_expires_at,
      last_synced_at=last_synced_at,
      sync_error=sync_error,
      accounts=accounts,
    )

    montrose_connection_schema.additional_properties = d
    return montrose_connection_schema

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
