from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.bank_connection_schema import BankConnectionSchema
  from ..models.bank_option import BankOption


T = TypeVar("T", bound="BankConnectionListResponse")


@_attrs_define
class BankConnectionListResponse:
  """
  Attributes:
      available (bool): Whether this user can connect a bank.
      banks (list[str]): The banks this user can connect.
      bank_options (list[BankOption]): The same banks with their logos.
      connections (list[BankConnectionSchema]):
  """

  available: bool
  banks: list[str]
  bank_options: list[BankOption]
  connections: list[BankConnectionSchema]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    available = self.available

    banks = self.banks

    bank_options = []
    for bank_options_item_data in self.bank_options:
      bank_options_item = bank_options_item_data.to_dict()
      bank_options.append(bank_options_item)

    connections = []
    for connections_item_data in self.connections:
      connections_item = connections_item_data.to_dict()
      connections.append(connections_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "available": available,
        "banks": banks,
        "bank_options": bank_options,
        "connections": connections,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.bank_connection_schema import BankConnectionSchema
    from ..models.bank_option import BankOption

    d = dict(src_dict)
    available = d.pop("available")

    banks = cast(list[str], d.pop("banks"))

    bank_options = []
    _bank_options = d.pop("bank_options")
    for bank_options_item_data in _bank_options:
      bank_options_item = BankOption.from_dict(bank_options_item_data)

      bank_options.append(bank_options_item)

    connections = []
    _connections = d.pop("connections")
    for connections_item_data in _connections:
      connections_item = BankConnectionSchema.from_dict(connections_item_data)

      connections.append(connections_item)

    bank_connection_list_response = cls(
      available=available,
      banks=banks,
      bank_options=bank_options,
      connections=connections,
    )

    bank_connection_list_response.additional_properties = d
    return bank_connection_list_response

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
