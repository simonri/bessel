from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.account_overview import AccountOverview
  from ..models.overview_total import OverviewTotal


T = TypeVar("T", bound="AccountsOverviewResponse")


@_attrs_define
class AccountsOverviewResponse:
  """
  Attributes:
      accounts (list[AccountOverview]):
      totals (list[OverviewTotal]): Per owner and currency; currencies are never added together.
  """

  accounts: list[AccountOverview]
  totals: list[OverviewTotal]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    accounts = []
    for accounts_item_data in self.accounts:
      accounts_item = accounts_item_data.to_dict()
      accounts.append(accounts_item)

    totals = []
    for totals_item_data in self.totals:
      totals_item = totals_item_data.to_dict()
      totals.append(totals_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "accounts": accounts,
        "totals": totals,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.account_overview import AccountOverview
    from ..models.overview_total import OverviewTotal

    d = dict(src_dict)
    accounts = []
    _accounts = d.pop("accounts")
    for accounts_item_data in _accounts:
      accounts_item = AccountOverview.from_dict(accounts_item_data)

      accounts.append(accounts_item)

    totals = []
    _totals = d.pop("totals")
    for totals_item_data in _totals:
      totals_item = OverviewTotal.from_dict(totals_item_data)

      totals.append(totals_item)

    accounts_overview_response = cls(
      accounts=accounts,
      totals=totals,
    )

    accounts_overview_response.additional_properties = d
    return accounts_overview_response

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
