from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.account_overview_group import AccountOverviewGroup
from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.account_source import AccountSource
  from ..models.balance_point import BalancePoint


T = TypeVar("T", bound="AccountOverview")


@_attrs_define
class AccountOverview:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      name (str): Display name of the bank account.
      currency (str): ISO 4217 currency code.
      base_balance (int): Starting balance in minor units (cents).
      subtype (str): Account subtype, e.g. 'checking', 'savings'.
      is_business (bool): Whether the account belongs to the user's company rather than the user.
      group (AccountOverviewGroup):
      source (AccountSource):
      bank_balance (int | None): The balance the bank or broker reported at the last sync, in minor units.
      balance_drift (int | None): The bank's balance minus Bessel's; anything but 0 means a transaction is missing.
      holdings_value (int | None): What the account's holdings are worth, for investment accounts, in minor units.
      first_transaction (datetime.date | None):
      last_transaction (datetime.date | None):
      transaction_count (int):
      history (list[BalancePoint]): Month-end balances for up to a year, from the account's first transaction on.
      current_balance (int | Unset): Current balance in minor units (base_balance + credits - debits). Default: 0.
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  name: str
  currency: str
  base_balance: int
  subtype: str
  is_business: bool
  group: AccountOverviewGroup
  source: AccountSource
  bank_balance: int | None
  balance_drift: int | None
  holdings_value: int | None
  first_transaction: datetime.date | None
  last_transaction: datetime.date | None
  transaction_count: int
  history: list[BalancePoint]
  current_balance: int | Unset = 0
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

    is_business = self.is_business

    group = self.group.value

    source = self.source.to_dict()

    bank_balance: int | None
    bank_balance = self.bank_balance

    balance_drift: int | None
    balance_drift = self.balance_drift

    holdings_value: int | None
    holdings_value = self.holdings_value

    first_transaction: None | str
    if isinstance(self.first_transaction, datetime.date):
      first_transaction = self.first_transaction.isoformat()
    else:
      first_transaction = self.first_transaction

    last_transaction: None | str
    if isinstance(self.last_transaction, datetime.date):
      last_transaction = self.last_transaction.isoformat()
    else:
      last_transaction = self.last_transaction

    transaction_count = self.transaction_count

    history = []
    for history_item_data in self.history:
      history_item = history_item_data.to_dict()
      history.append(history_item)

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
        "is_business": is_business,
        "group": group,
        "source": source,
        "bank_balance": bank_balance,
        "balance_drift": balance_drift,
        "holdings_value": holdings_value,
        "first_transaction": first_transaction,
        "last_transaction": last_transaction,
        "transaction_count": transaction_count,
        "history": history,
      }
    )
    if current_balance is not UNSET:
      field_dict["current_balance"] = current_balance

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.account_source import AccountSource
    from ..models.balance_point import BalancePoint

    d = dict(src_dict)
    created_at = datetime.datetime.fromisoformat(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = datetime.datetime.fromisoformat(data)

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

    is_business = d.pop("is_business")

    group = AccountOverviewGroup(d.pop("group"))

    source = AccountSource.from_dict(d.pop("source"))

    def _parse_bank_balance(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    bank_balance = _parse_bank_balance(d.pop("bank_balance"))

    def _parse_balance_drift(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    balance_drift = _parse_balance_drift(d.pop("balance_drift"))

    def _parse_holdings_value(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    holdings_value = _parse_holdings_value(d.pop("holdings_value"))

    def _parse_first_transaction(data: object) -> datetime.date | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        first_transaction_type_0 = datetime.date.fromisoformat(data)

        return first_transaction_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.date | None, data)

    first_transaction = _parse_first_transaction(d.pop("first_transaction"))

    def _parse_last_transaction(data: object) -> datetime.date | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        last_transaction_type_0 = datetime.date.fromisoformat(data)

        return last_transaction_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.date | None, data)

    last_transaction = _parse_last_transaction(d.pop("last_transaction"))

    transaction_count = d.pop("transaction_count")

    history = []
    _history = d.pop("history")
    for history_item_data in _history:
      history_item = BalancePoint.from_dict(history_item_data)

      history.append(history_item)

    current_balance = d.pop("current_balance", UNSET)

    account_overview = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      name=name,
      currency=currency,
      base_balance=base_balance,
      subtype=subtype,
      is_business=is_business,
      group=group,
      source=source,
      bank_balance=bank_balance,
      balance_drift=balance_drift,
      holdings_value=holdings_value,
      first_transaction=first_transaction,
      last_transaction=last_transaction,
      transaction_count=transaction_count,
      history=history,
      current_balance=current_balance,
    )

    account_overview.additional_properties = d
    return account_overview

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
