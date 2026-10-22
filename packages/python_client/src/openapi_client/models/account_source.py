from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.account_source_kind import AccountSourceKind
from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.account_problem import AccountProblem


T = TypeVar("T", bound="AccountSource")


@_attrs_define
class AccountSource:
  """
  Attributes:
      kind (AccountSourceKind): Where the account's transactions come from.
      label (str): The source as the user knows it, such as 'Skandia' or 'Imported by hand'.
      synced_at (datetime.datetime | None): The last sync or import that worked.
      issue (AccountProblem | None): What needs the user's attention, if anything.
      problem (None | str): The issue in words, for app versions from before `issue`.
      logo (None | str | Unset): The bank's logo image URL, when one is known.
      access_until (datetime.datetime | None | Unset): When the bank's read-only approval ends, for connected banks.
      import_bank (None | str | Unset): For accounts imported by hand, the bank of the latest export file, such as
          'marginalen'.
  """

  kind: AccountSourceKind
  label: str
  synced_at: datetime.datetime | None
  issue: AccountProblem | None
  problem: None | str
  logo: None | str | Unset = UNSET
  access_until: datetime.datetime | None | Unset = UNSET
  import_bank: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.account_problem import AccountProblem

    kind = self.kind.value

    label = self.label

    synced_at: None | str
    if isinstance(self.synced_at, datetime.datetime):
      synced_at = self.synced_at.isoformat()
    else:
      synced_at = self.synced_at

    issue: dict[str, Any] | None
    if isinstance(self.issue, AccountProblem):
      issue = self.issue.to_dict()
    else:
      issue = self.issue

    problem: None | str
    problem = self.problem

    logo: None | str | Unset
    if isinstance(self.logo, Unset):
      logo = UNSET
    else:
      logo = self.logo

    access_until: None | str | Unset
    if isinstance(self.access_until, Unset):
      access_until = UNSET
    elif isinstance(self.access_until, datetime.datetime):
      access_until = self.access_until.isoformat()
    else:
      access_until = self.access_until

    import_bank: None | str | Unset
    if isinstance(self.import_bank, Unset):
      import_bank = UNSET
    else:
      import_bank = self.import_bank

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "kind": kind,
        "label": label,
        "synced_at": synced_at,
        "issue": issue,
        "problem": problem,
      }
    )
    if logo is not UNSET:
      field_dict["logo"] = logo
    if access_until is not UNSET:
      field_dict["access_until"] = access_until
    if import_bank is not UNSET:
      field_dict["import_bank"] = import_bank

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.account_problem import AccountProblem

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

    def _parse_issue(data: object) -> AccountProblem | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        issue_type_0 = AccountProblem.from_dict(data)

        return issue_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(AccountProblem | None, data)

    issue = _parse_issue(d.pop("issue"))

    def _parse_problem(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    problem = _parse_problem(d.pop("problem"))

    def _parse_logo(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    logo = _parse_logo(d.pop("logo", UNSET))

    def _parse_access_until(data: object) -> datetime.datetime | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        access_until_type_0 = datetime.datetime.fromisoformat(data)

        return access_until_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None | Unset, data)

    access_until = _parse_access_until(d.pop("access_until", UNSET))

    def _parse_import_bank(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    import_bank = _parse_import_bank(d.pop("import_bank", UNSET))

    account_source = cls(
      kind=kind,
      label=label,
      synced_at=synced_at,
      issue=issue,
      problem=problem,
      logo=logo,
      access_until=access_until,
      import_bank=import_bank,
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
