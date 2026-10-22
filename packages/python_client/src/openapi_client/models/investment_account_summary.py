from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.year_amount import YearAmount


T = TypeVar("T", bound="InvestmentAccountSummary")


@_attrs_define
class InvestmentAccountSummary:
  """
  Attributes:
      bank_account_id (str):
      name (str):
      is_business (bool):
      currency (str):
      holdings_value (int): What the holdings are worth, in minor units.
      cash (int): Uninvested cash in the account, in minor units.
      total (int): Holdings plus cash.
      acquired_value (int): What the current holdings cost, in minor units.
      deposits (int): All money put into the account, in minor units.
      withdrawals (int): All money taken out of the account, in minor units.
      net_deposits (int): Deposits minus withdrawals.
      growth (int): Total minus net deposits: what the account made or lost overall.
      dividends (list[YearAmount]): Dividends received per year, newest first.
      first_transaction (datetime.date | None):
  """

  bank_account_id: str
  name: str
  is_business: bool
  currency: str
  holdings_value: int
  cash: int
  total: int
  acquired_value: int
  deposits: int
  withdrawals: int
  net_deposits: int
  growth: int
  dividends: list[YearAmount]
  first_transaction: datetime.date | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    bank_account_id = self.bank_account_id

    name = self.name

    is_business = self.is_business

    currency = self.currency

    holdings_value = self.holdings_value

    cash = self.cash

    total = self.total

    acquired_value = self.acquired_value

    deposits = self.deposits

    withdrawals = self.withdrawals

    net_deposits = self.net_deposits

    growth = self.growth

    dividends = []
    for dividends_item_data in self.dividends:
      dividends_item = dividends_item_data.to_dict()
      dividends.append(dividends_item)

    first_transaction: None | str
    if isinstance(self.first_transaction, datetime.date):
      first_transaction = self.first_transaction.isoformat()
    else:
      first_transaction = self.first_transaction

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "bank_account_id": bank_account_id,
        "name": name,
        "is_business": is_business,
        "currency": currency,
        "holdings_value": holdings_value,
        "cash": cash,
        "total": total,
        "acquired_value": acquired_value,
        "deposits": deposits,
        "withdrawals": withdrawals,
        "net_deposits": net_deposits,
        "growth": growth,
        "dividends": dividends,
        "first_transaction": first_transaction,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.year_amount import YearAmount

    d = dict(src_dict)
    bank_account_id = d.pop("bank_account_id")

    name = d.pop("name")

    is_business = d.pop("is_business")

    currency = d.pop("currency")

    holdings_value = d.pop("holdings_value")

    cash = d.pop("cash")

    total = d.pop("total")

    acquired_value = d.pop("acquired_value")

    deposits = d.pop("deposits")

    withdrawals = d.pop("withdrawals")

    net_deposits = d.pop("net_deposits")

    growth = d.pop("growth")

    dividends = []
    _dividends = d.pop("dividends")
    for dividends_item_data in _dividends:
      dividends_item = YearAmount.from_dict(dividends_item_data)

      dividends.append(dividends_item)

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

    investment_account_summary = cls(
      bank_account_id=bank_account_id,
      name=name,
      is_business=is_business,
      currency=currency,
      holdings_value=holdings_value,
      cash=cash,
      total=total,
      acquired_value=acquired_value,
      deposits=deposits,
      withdrawals=withdrawals,
      net_deposits=net_deposits,
      growth=growth,
      dividends=dividends,
      first_transaction=first_transaction,
    )

    investment_account_summary.additional_properties = d
    return investment_account_summary

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
