from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="GymTopSetSchema")


@_attrs_define
class GymTopSetSchema:
  """
  Attributes:
      performed_on (datetime.date): The local day it was lifted.
      weight_kg (float):
  """

  performed_on: datetime.date
  weight_kg: float
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    performed_on = self.performed_on.isoformat()

    weight_kg = self.weight_kg

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "performed_on": performed_on,
        "weight_kg": weight_kg,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    performed_on = datetime.date.fromisoformat(d.pop("performed_on"))

    weight_kg = d.pop("weight_kg")

    gym_top_set_schema = cls(
      performed_on=performed_on,
      weight_kg=weight_kg,
    )

    gym_top_set_schema.additional_properties = d
    return gym_top_set_schema

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
