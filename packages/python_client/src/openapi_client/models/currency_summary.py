from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.summary_category import SummaryCategory
  from ..models.summary_merchant import SummaryMerchant
  from ..models.summary_month import SummaryMonth


T = TypeVar("T", bound="CurrencySummary")


@_attrs_define
class CurrencySummary:
  """
  Attributes:
      currency (str):
      income (int):
      spending (int):
      net (int): Income minus spending.
      previous (SummaryMonth):
      average_income (int): Average income over the six months before this one.
      average_spending (int): Average spending over the six months before this one.
      months (list[SummaryMonth]): The twelve months up to and including this one, oldest first.
      categories (list[SummaryCategory]): This month's spending per category, largest first.
      merchants (list[SummaryMerchant]): This month's biggest spending by description, largest first.
  """

  currency: str
  income: int
  spending: int
  net: int
  previous: SummaryMonth
  average_income: int
  average_spending: int
  months: list[SummaryMonth]
  categories: list[SummaryCategory]
  merchants: list[SummaryMerchant]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    currency = self.currency

    income = self.income

    spending = self.spending

    net = self.net

    previous = self.previous.to_dict()

    average_income = self.average_income

    average_spending = self.average_spending

    months = []
    for months_item_data in self.months:
      months_item = months_item_data.to_dict()
      months.append(months_item)

    categories = []
    for categories_item_data in self.categories:
      categories_item = categories_item_data.to_dict()
      categories.append(categories_item)

    merchants = []
    for merchants_item_data in self.merchants:
      merchants_item = merchants_item_data.to_dict()
      merchants.append(merchants_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "currency": currency,
        "income": income,
        "spending": spending,
        "net": net,
        "previous": previous,
        "average_income": average_income,
        "average_spending": average_spending,
        "months": months,
        "categories": categories,
        "merchants": merchants,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.summary_category import SummaryCategory
    from ..models.summary_merchant import SummaryMerchant
    from ..models.summary_month import SummaryMonth

    d = dict(src_dict)
    currency = d.pop("currency")

    income = d.pop("income")

    spending = d.pop("spending")

    net = d.pop("net")

    previous = SummaryMonth.from_dict(d.pop("previous"))

    average_income = d.pop("average_income")

    average_spending = d.pop("average_spending")

    months = []
    _months = d.pop("months")
    for months_item_data in _months:
      months_item = SummaryMonth.from_dict(months_item_data)

      months.append(months_item)

    categories = []
    _categories = d.pop("categories")
    for categories_item_data in _categories:
      categories_item = SummaryCategory.from_dict(categories_item_data)

      categories.append(categories_item)

    merchants = []
    _merchants = d.pop("merchants")
    for merchants_item_data in _merchants:
      merchants_item = SummaryMerchant.from_dict(merchants_item_data)

      merchants.append(merchants_item)

    currency_summary = cls(
      currency=currency,
      income=income,
      spending=spending,
      net=net,
      previous=previous,
      average_income=average_income,
      average_spending=average_spending,
      months=months,
      categories=categories,
      merchants=merchants,
    )

    currency_summary.additional_properties = d
    return currency_summary

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
