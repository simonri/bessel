from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.account_problem_kind import AccountProblemKind
from ..types import UNSET, Unset

T = TypeVar("T", bound="AccountProblem")


@_attrs_define
class AccountProblem:
  """What needs the user's attention; the app words it, so amounts and dates stay in its own formats.

  Attributes:
      kind (AccountProblemKind): What went wrong; not_shared means the latest bank approval left the account out,
          sign_in that the login was rejected.
      day (datetime.date | None | Unset): The last sync or import, or for renew_soon the day the approval ends.
      source_balance (int | None | Unset): For balance_mismatch, the balance the source reports, in minor units.
      detail (None | str | Unset): For sync_failed, what went wrong.
  """

  kind: AccountProblemKind
  day: datetime.date | None | Unset = UNSET
  source_balance: int | None | Unset = UNSET
  detail: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    kind = self.kind.value

    day: None | str | Unset
    if isinstance(self.day, Unset):
      day = UNSET
    elif isinstance(self.day, datetime.date):
      day = self.day.isoformat()
    else:
      day = self.day

    source_balance: int | None | Unset
    if isinstance(self.source_balance, Unset):
      source_balance = UNSET
    else:
      source_balance = self.source_balance

    detail: None | str | Unset
    if isinstance(self.detail, Unset):
      detail = UNSET
    else:
      detail = self.detail

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "kind": kind,
      }
    )
    if day is not UNSET:
      field_dict["day"] = day
    if source_balance is not UNSET:
      field_dict["source_balance"] = source_balance
    if detail is not UNSET:
      field_dict["detail"] = detail

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    kind = AccountProblemKind(d.pop("kind"))

    def _parse_day(data: object) -> datetime.date | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        day_type_0 = datetime.date.fromisoformat(data)

        return day_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.date | None | Unset, data)

    day = _parse_day(d.pop("day", UNSET))

    def _parse_source_balance(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    source_balance = _parse_source_balance(d.pop("source_balance", UNSET))

    def _parse_detail(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    detail = _parse_detail(d.pop("detail", UNSET))

    account_problem = cls(
      kind=kind,
      day=day,
      source_balance=source_balance,
      detail=detail,
    )

    account_problem.additional_properties = d
    return account_problem

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
