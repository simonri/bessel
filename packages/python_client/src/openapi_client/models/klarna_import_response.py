from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="KlarnaImportResponse")


@_attrs_define
class KlarnaImportResponse:
  """
  Attributes:
      created (int): Pay later purchases imported for the first time.
      updated (int): Purchases imported before whose amount changed, after a return.
      paid_at_purchase (int): Items left out because they were paid at purchase and show in a bank account, card or
          the Klarna balance.
      unrecognized_plans (list[str]): Payment plans Bessel doesn't know yet; their purchases were imported as pay
          later.
  """

  created: int
  updated: int
  paid_at_purchase: int
  unrecognized_plans: list[str]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created = self.created

    updated = self.updated

    paid_at_purchase = self.paid_at_purchase

    unrecognized_plans = self.unrecognized_plans

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created": created,
        "updated": updated,
        "paid_at_purchase": paid_at_purchase,
        "unrecognized_plans": unrecognized_plans,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    created = d.pop("created")

    updated = d.pop("updated")

    paid_at_purchase = d.pop("paid_at_purchase")

    unrecognized_plans = cast(list[str], d.pop("unrecognized_plans"))

    klarna_import_response = cls(
      created=created,
      updated=updated,
      paid_at_purchase=paid_at_purchase,
      unrecognized_plans=unrecognized_plans,
    )

    klarna_import_response.additional_properties = d
    return klarna_import_response

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
