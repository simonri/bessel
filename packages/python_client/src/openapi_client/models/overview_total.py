from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.overview_total_owner import OverviewTotalOwner

T = TypeVar("T", bound="OverviewTotal")


@_attrs_define
class OverviewTotal:
  """
  Attributes:
      owner (OverviewTotalOwner):
      currency (str):
      cash (int): Money in cash and savings accounts.
      investments (int): Investment accounts: holdings plus cash.
      debt (int): What is owed on credit accounts, as a positive amount.
      net (int): Cash plus investments minus debt.
  """

  owner: OverviewTotalOwner
  currency: str
  cash: int
  investments: int
  debt: int
  net: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    owner = self.owner.value

    currency = self.currency

    cash = self.cash

    investments = self.investments

    debt = self.debt

    net = self.net

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "owner": owner,
        "currency": currency,
        "cash": cash,
        "investments": investments,
        "debt": debt,
        "net": net,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    owner = OverviewTotalOwner(d.pop("owner"))

    currency = d.pop("currency")

    cash = d.pop("cash")

    investments = d.pop("investments")

    debt = d.pop("debt")

    net = d.pop("net")

    overview_total = cls(
      owner=owner,
      currency=currency,
      cash=cash,
      investments=investments,
      debt=debt,
      net=net,
    )

    overview_total.additional_properties = d
    return overview_total

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
