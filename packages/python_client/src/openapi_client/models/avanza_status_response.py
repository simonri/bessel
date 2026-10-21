from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.avanza_connection_schema import AvanzaConnectionSchema


T = TypeVar("T", bound="AvanzaStatusResponse")


@_attrs_define
class AvanzaStatusResponse:
  """
  Attributes:
      available (bool): Whether this user can connect Avanza.
      connection (AvanzaConnectionSchema | None):
  """

  available: bool
  connection: AvanzaConnectionSchema | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.avanza_connection_schema import AvanzaConnectionSchema

    available = self.available

    connection: dict[str, Any] | None
    if isinstance(self.connection, AvanzaConnectionSchema):
      connection = self.connection.to_dict()
    else:
      connection = self.connection

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "available": available,
        "connection": connection,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.avanza_connection_schema import AvanzaConnectionSchema

    d = dict(src_dict)
    available = d.pop("available")

    def _parse_connection(data: object) -> AvanzaConnectionSchema | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        connection_type_0 = AvanzaConnectionSchema.from_dict(data)

        return connection_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(AvanzaConnectionSchema | None, data)

    connection = _parse_connection(d.pop("connection"))

    avanza_status_response = cls(
      available=available,
      connection=connection,
    )

    avanza_status_response.additional_properties = d
    return avanza_status_response

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
