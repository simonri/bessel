from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.currency_summary import CurrencySummary


T = TypeVar("T", bound="TransactionSummaryResponse")


@_attrs_define
class TransactionSummaryResponse:
  """
  Attributes:
      year (int):
      month (int):
      currencies (list[CurrencySummary]): One summary per currency, never added together; most spending first.
      uncategorized (int): This month's counted transactions without a category.
      transfers (int): This month's transactions left out as moves between the user's own accounts.
  """

  year: int
  month: int
  currencies: list[CurrencySummary]
  uncategorized: int
  transfers: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    year = self.year

    month = self.month

    currencies = []
    for currencies_item_data in self.currencies:
      currencies_item = currencies_item_data.to_dict()
      currencies.append(currencies_item)

    uncategorized = self.uncategorized

    transfers = self.transfers

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "year": year,
        "month": month,
        "currencies": currencies,
        "uncategorized": uncategorized,
        "transfers": transfers,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.currency_summary import CurrencySummary

    d = dict(src_dict)
    year = d.pop("year")

    month = d.pop("month")

    currencies = []
    _currencies = d.pop("currencies")
    for currencies_item_data in _currencies:
      currencies_item = CurrencySummary.from_dict(currencies_item_data)

      currencies.append(currencies_item)

    uncategorized = d.pop("uncategorized")

    transfers = d.pop("transfers")

    transaction_summary_response = cls(
      year=year,
      month=month,
      currencies=currencies,
      uncategorized=uncategorized,
      transfers=transfers,
    )

    transaction_summary_response.additional_properties = d
    return transaction_summary_response

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
