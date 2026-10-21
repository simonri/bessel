from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast
from uuid import UUID

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="BankConnectionAccountSchema")


@_attrs_define
class BankConnectionAccountSchema:
  """
  Attributes:
      id (UUID):
      name (None | str):
      iban (None | str):
      currency (str):
      bank_account_id (None | UUID): The Bessel account its transactions go into; nothing is imported until one is
          chosen.
      import_from (datetime.date | None): The first day imported, so transactions imported by hand aren't repeated.
      shared (bool): False when the latest bank approval didn't include this account.
  """

  id: UUID
  name: None | str
  iban: None | str
  currency: str
  bank_account_id: None | UUID
  import_from: datetime.date | None
  shared: bool
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    id = str(self.id)

    name: None | str
    name = self.name

    iban: None | str
    iban = self.iban

    currency = self.currency

    bank_account_id: None | str
    if isinstance(self.bank_account_id, UUID):
      bank_account_id = str(self.bank_account_id)
    else:
      bank_account_id = self.bank_account_id

    import_from: None | str
    if isinstance(self.import_from, datetime.date):
      import_from = self.import_from.isoformat()
    else:
      import_from = self.import_from

    shared = self.shared

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "id": id,
        "name": name,
        "iban": iban,
        "currency": currency,
        "bank_account_id": bank_account_id,
        "import_from": import_from,
        "shared": shared,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    id = UUID(d.pop("id"))

    def _parse_name(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    name = _parse_name(d.pop("name"))

    def _parse_iban(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    iban = _parse_iban(d.pop("iban"))

    currency = d.pop("currency")

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

    def _parse_import_from(data: object) -> datetime.date | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        import_from_type_0 = datetime.date.fromisoformat(data)

        return import_from_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.date | None, data)

    import_from = _parse_import_from(d.pop("import_from"))

    shared = d.pop("shared")

    bank_connection_account_schema = cls(
      id=id,
      name=name,
      iban=iban,
      currency=currency,
      bank_account_id=bank_account_id,
      import_from=import_from,
      shared=shared,
    )

    bank_connection_account_schema.additional_properties = d
    return bank_connection_account_schema

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
