from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="MontroseAccountUpdate")


@_attrs_define
class MontroseAccountUpdate:
  """
  Attributes:
      bank_account_id (None | UUID): The Bessel account to import into, or null to stop importing.
  """

  bank_account_id: None | UUID
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    bank_account_id: None | str
    if isinstance(self.bank_account_id, UUID):
      bank_account_id = str(self.bank_account_id)
    else:
      bank_account_id = self.bank_account_id

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "bank_account_id": bank_account_id,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)

    def _parse_bank_account_id(data: object) -> None | UUID:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        bank_account_id_type_0 = UUID(data)

        return bank_account_id_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | UUID, data)

    bank_account_id = _parse_bank_account_id(d.pop("bank_account_id"))

    montrose_account_update = cls(
      bank_account_id=bank_account_id,
    )

    montrose_account_update.additional_properties = d
    return montrose_account_update

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
