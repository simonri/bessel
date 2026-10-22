from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

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
      banks (list[BankOption]): The banks this user can connect.
      connections (list[BankConnectionSchema]):
  """

  available: bool
  banks: list[BankOption]
  connections: list[BankConnectionSchema]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    available = self.available

    banks = []
    for banks_item_data in self.banks:
      banks_item = banks_item_data.to_dict()
      banks.append(banks_item)

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

    banks = []
    _banks = d.pop("banks")
    for banks_item_data in _banks:
      banks_item = BankOption.from_dict(banks_item_data)

      banks.append(banks_item)

    connections = []
    _connections = d.pop("connections")
    for connections_item_data in _connections:
      connections_item = BankConnectionSchema.from_dict(connections_item_data)

      connections.append(connections_item)

    bank_connection_list_response = cls(
      available=available,
      banks=banks,
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
