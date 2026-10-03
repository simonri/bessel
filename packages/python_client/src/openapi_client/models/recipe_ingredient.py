from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="RecipeIngredient")


@_attrs_define
class RecipeIngredient:
  """
  Attributes:
      name (str):
      amount (float | None | Unset): Quantity, e.g. 1.5 for 1½.
      unit (None | str | Unset):
      note (None | str | Unset): Preparation or alternatives, e.g. 'grovhackade'.
  """

  name: str
  amount: float | None | Unset = UNSET
  unit: None | str | Unset = UNSET
  note: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    name = self.name

    amount: float | None | Unset
    if isinstance(self.amount, Unset):
      amount = UNSET
    else:
      amount = self.amount

    unit: None | str | Unset
    if isinstance(self.unit, Unset):
      unit = UNSET
    else:
      unit = self.unit

    note: None | str | Unset
    if isinstance(self.note, Unset):
      note = UNSET
    else:
      note = self.note

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "name": name,
      }
    )
    if amount is not UNSET:
      field_dict["amount"] = amount
    if unit is not UNSET:
      field_dict["unit"] = unit
    if note is not UNSET:
      field_dict["note"] = note

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    name = d.pop("name")

    def _parse_amount(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    amount = _parse_amount(d.pop("amount", UNSET))

    def _parse_unit(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    unit = _parse_unit(d.pop("unit", UNSET))

    def _parse_note(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    note = _parse_note(d.pop("note", UNSET))

    recipe_ingredient = cls(
      name=name,
      amount=amount,
      unit=unit,
      note=note,
    )

    recipe_ingredient.additional_properties = d
    return recipe_ingredient

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
