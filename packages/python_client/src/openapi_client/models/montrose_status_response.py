from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.montrose_connection_schema import MontroseConnectionSchema


T = TypeVar("T", bound="MontroseStatusResponse")


@_attrs_define
class MontroseStatusResponse:
  """
  Attributes:
      connection (MontroseConnectionSchema | None):
  """

  connection: MontroseConnectionSchema | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.montrose_connection_schema import MontroseConnectionSchema

    connection: dict[str, Any] | None
    if isinstance(self.connection, MontroseConnectionSchema):
      connection = self.connection.to_dict()
    else:
      connection = self.connection

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "connection": connection,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.montrose_connection_schema import MontroseConnectionSchema

    d = dict(src_dict)

    def _parse_connection(data: object) -> MontroseConnectionSchema | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        connection_type_0 = MontroseConnectionSchema.from_dict(data)

        return connection_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(MontroseConnectionSchema | None, data)

    connection = _parse_connection(d.pop("connection"))

    montrose_status_response = cls(
      connection=connection,
    )

    montrose_status_response.additional_properties = d
    return montrose_status_response

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
