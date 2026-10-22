from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="TransactionUpdate")


@_attrs_define
class TransactionUpdate:
  """
  Attributes:
      category_id (None | str | Unset): Category ID to assign.
      is_business (bool | None | Unset): Mark as a business transaction.
      note (None | str | Unset): The user's own words about it; empty removes it.
  """

  category_id: None | str | Unset = UNSET
  is_business: bool | None | Unset = UNSET
  note: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    category_id: None | str | Unset
    if isinstance(self.category_id, Unset):
      category_id = UNSET
    else:
      category_id = self.category_id

    is_business: bool | None | Unset
    if isinstance(self.is_business, Unset):
      is_business = UNSET
    else:
      is_business = self.is_business

    note: None | str | Unset
    if isinstance(self.note, Unset):
      note = UNSET
    else:
      note = self.note

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if category_id is not UNSET:
      field_dict["category_id"] = category_id
    if is_business is not UNSET:
      field_dict["is_business"] = is_business
    if note is not UNSET:
      field_dict["note"] = note

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_category_id(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    category_id = _parse_category_id(d.pop("category_id", UNSET))

    def _parse_is_business(data: object) -> bool | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(bool | None | Unset, data)

    is_business = _parse_is_business(d.pop("is_business", UNSET))

    def _parse_note(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    note = _parse_note(d.pop("note", UNSET))

    transaction_update = cls(
      category_id=category_id,
      is_business=is_business,
      note=note,
    )

    transaction_update.additional_properties = d
    return transaction_update

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
