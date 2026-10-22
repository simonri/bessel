from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.account_source_kind import AccountSourceKind

T = TypeVar("T", bound="AccountSource")


@_attrs_define
class AccountSource:
  """
  Attributes:
      kind (AccountSourceKind): Where the account's transactions come from.
      label (str): The source as the user knows it, such as 'Skandia' or 'Imported by hand'.
      synced_at (datetime.datetime | None): The last sync or import that worked.
      problem (None | str): What needs the user's attention, if anything.
  """

  kind: AccountSourceKind
  label: str
  synced_at: datetime.datetime | None
  problem: None | str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    kind = self.kind.value

    label = self.label

    synced_at: None | str
    if isinstance(self.synced_at, datetime.datetime):
      synced_at = self.synced_at.isoformat()
    else:
      synced_at = self.synced_at

    problem: None | str
    problem = self.problem

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "kind": kind,
        "label": label,
        "synced_at": synced_at,
        "problem": problem,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    kind = AccountSourceKind(d.pop("kind"))

    label = d.pop("label")

    def _parse_synced_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        synced_at_type_0 = datetime.datetime.fromisoformat(data)

        return synced_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    synced_at = _parse_synced_at(d.pop("synced_at"))

    def _parse_problem(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    problem = _parse_problem(d.pop("problem"))

    account_source = cls(
      kind=kind,
      label=label,
      synced_at=synced_at,
      problem=problem,
    )

    account_source.additional_properties = d
    return account_source

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
