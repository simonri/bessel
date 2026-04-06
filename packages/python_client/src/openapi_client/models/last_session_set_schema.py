from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="LastSessionSetSchema")


@_attrs_define
class LastSessionSetSchema:
  """
  Attributes:
      set_number (int):
      weight (float):
      reps (int):
      weight_unit (str):
      rir (int | None):
      set_type (None | str):
  """

  set_number: int
  weight: float
  reps: int
  weight_unit: str
  rir: int | None
  set_type: None | str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    set_number = self.set_number

    weight = self.weight

    reps = self.reps

    weight_unit = self.weight_unit

    rir: int | None
    rir = self.rir

    set_type: None | str
    set_type = self.set_type

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "set_number": set_number,
        "weight": weight,
        "reps": reps,
        "weight_unit": weight_unit,
        "rir": rir,
        "set_type": set_type,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    set_number = d.pop("set_number")

    weight = d.pop("weight")

    reps = d.pop("reps")

    weight_unit = d.pop("weight_unit")

    def _parse_rir(data: object) -> int | None:
      if data is None:
        return data
      return cast(int | None, data)

    rir = _parse_rir(d.pop("rir"))

    def _parse_set_type(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    set_type = _parse_set_type(d.pop("set_type"))

    last_session_set_schema = cls(
      set_number=set_number,
      weight=weight,
      reps=reps,
      weight_unit=weight_unit,
      rir=rir,
      set_type=set_type,
    )

    last_session_set_schema.additional_properties = d
    return last_session_set_schema

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
