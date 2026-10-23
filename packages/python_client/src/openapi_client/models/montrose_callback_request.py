from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="MontroseCallbackRequest")


@_attrs_define
class MontroseCallbackRequest:
  """
  Attributes:
      code (str):
      state (str):
      iss (None | str | Unset): The issuer Montrose names on the redirect, checked against its own.
  """

  code: str
  state: str
  iss: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    code = self.code

    state = self.state

    iss: None | str | Unset
    if isinstance(self.iss, Unset):
      iss = UNSET
    else:
      iss = self.iss

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "code": code,
        "state": state,
      }
    )
    if iss is not UNSET:
      field_dict["iss"] = iss

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    code = d.pop("code")

    state = d.pop("state")

    def _parse_iss(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    iss = _parse_iss(d.pop("iss", UNSET))

    montrose_callback_request = cls(
      code=code,
      state=state,
      iss=iss,
    )

    montrose_callback_request.additional_properties = d
    return montrose_callback_request

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
