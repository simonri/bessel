from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.investment_kind import InvestmentKind
from ..models.transaction_direction import TransactionDirection
from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.name_suggestion import NameSuggestion


T = TypeVar("T", bound="TransactionRenameResponse")


@_attrs_define
class TransactionRenameResponse:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      amount (int): Amount in minor units (cents).
      currency (str):
      transaction_date (datetime.date):
      direction (TransactionDirection):
      description (None | str): The bank's own text, never changed.
      category_id (None | str):
      transaction_type (None | str):
      dedup_hash (str):
      bank_account_id (str):
      raw_id (None | str):
      suggestions (list[NameSuggestion]): Others that likely want the same name: first this one's own bank text, if
          others have it, then similar ones.
      investment_kind (InvestmentKind | None): For a broker's movement, what it is, such as a buy or a tax.
      name (None | str | Unset): What the user calls it, shown in place of the bank's text.
      note (None | str | Unset): The user's own words about this one transaction.
      logo_url (None | str | Unset): The merchant's logo, when the source provides it.
      document_count (int | Unset): Invoices and receipts kept with it. Default: 0.
      is_business (bool | Unset): Marked as a business transaction, such as a company cost paid privately. Default:
          False.
      company_account (bool | Unset): On an account of the user's company, so company money whatever is_business says.
          Default: False.
      transfer_id (None | str | Unset): Shared with the other side of a move between the user's own accounts; such
          pairs count as neither income nor spending.
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  amount: int
  currency: str
  transaction_date: datetime.date
  direction: TransactionDirection
  description: None | str
  category_id: None | str
  transaction_type: None | str
  dedup_hash: str
  bank_account_id: str
  raw_id: None | str
  suggestions: list[NameSuggestion]
  investment_kind: InvestmentKind | None
  name: None | str | Unset = UNSET
  note: None | str | Unset = UNSET
  logo_url: None | str | Unset = UNSET
  document_count: int | Unset = 0
  is_business: bool | Unset = False
  company_account: bool | Unset = False
  transfer_id: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    amount = self.amount

    currency = self.currency

    transaction_date = self.transaction_date.isoformat()

    direction = self.direction.value

    description: None | str
    description = self.description

    category_id: None | str
    category_id = self.category_id

    transaction_type: None | str
    transaction_type = self.transaction_type

    dedup_hash = self.dedup_hash

    bank_account_id = self.bank_account_id

    raw_id: None | str
    raw_id = self.raw_id

    suggestions = []
    for suggestions_item_data in self.suggestions:
      suggestions_item = suggestions_item_data.to_dict()
      suggestions.append(suggestions_item)

    investment_kind: None | str
    if isinstance(self.investment_kind, InvestmentKind):
      investment_kind = self.investment_kind.value
    else:
      investment_kind = self.investment_kind

    name: None | str | Unset
    if isinstance(self.name, Unset):
      name = UNSET
    else:
      name = self.name

    note: None | str | Unset
    if isinstance(self.note, Unset):
      note = UNSET
    else:
      note = self.note

    logo_url: None | str | Unset
    if isinstance(self.logo_url, Unset):
      logo_url = UNSET
    else:
      logo_url = self.logo_url

    document_count = self.document_count

    is_business = self.is_business

    company_account = self.company_account

    transfer_id: None | str | Unset
    if isinstance(self.transfer_id, Unset):
      transfer_id = UNSET
    else:
      transfer_id = self.transfer_id

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "amount": amount,
        "currency": currency,
        "transaction_date": transaction_date,
        "direction": direction,
        "description": description,
        "category_id": category_id,
        "transaction_type": transaction_type,
        "dedup_hash": dedup_hash,
        "bank_account_id": bank_account_id,
        "raw_id": raw_id,
        "suggestions": suggestions,
        "investment_kind": investment_kind,
      }
    )
    if name is not UNSET:
      field_dict["name"] = name
    if note is not UNSET:
      field_dict["note"] = note
    if logo_url is not UNSET:
      field_dict["logo_url"] = logo_url
    if document_count is not UNSET:
      field_dict["document_count"] = document_count
    if is_business is not UNSET:
      field_dict["is_business"] = is_business
    if company_account is not UNSET:
      field_dict["company_account"] = company_account
    if transfer_id is not UNSET:
      field_dict["transfer_id"] = transfer_id

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.name_suggestion import NameSuggestion

    d = dict(src_dict)
    created_at = datetime.datetime.fromisoformat(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = datetime.datetime.fromisoformat(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    amount = d.pop("amount")

    currency = d.pop("currency")

    transaction_date = datetime.date.fromisoformat(d.pop("transaction_date"))

    direction = TransactionDirection(d.pop("direction"))

    def _parse_description(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    description = _parse_description(d.pop("description"))

    def _parse_category_id(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    category_id = _parse_category_id(d.pop("category_id"))

    def _parse_transaction_type(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    transaction_type = _parse_transaction_type(d.pop("transaction_type"))

    dedup_hash = d.pop("dedup_hash")

    bank_account_id = d.pop("bank_account_id")

    def _parse_raw_id(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    raw_id = _parse_raw_id(d.pop("raw_id"))

    suggestions = []
    _suggestions = d.pop("suggestions")
    for suggestions_item_data in _suggestions:
      suggestions_item = NameSuggestion.from_dict(suggestions_item_data)

      suggestions.append(suggestions_item)

    def _parse_investment_kind(data: object) -> InvestmentKind | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        investment_kind_type_0 = InvestmentKind(data)

        return investment_kind_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(InvestmentKind | None, data)

    investment_kind = _parse_investment_kind(d.pop("investment_kind"))

    def _parse_name(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    name = _parse_name(d.pop("name", UNSET))

    def _parse_note(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    note = _parse_note(d.pop("note", UNSET))

    def _parse_logo_url(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    logo_url = _parse_logo_url(d.pop("logo_url", UNSET))

    document_count = d.pop("document_count", UNSET)

    is_business = d.pop("is_business", UNSET)

    company_account = d.pop("company_account", UNSET)

    def _parse_transfer_id(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    transfer_id = _parse_transfer_id(d.pop("transfer_id", UNSET))

    transaction_rename_response = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      amount=amount,
      currency=currency,
      transaction_date=transaction_date,
      direction=direction,
      description=description,
      category_id=category_id,
      transaction_type=transaction_type,
      dedup_hash=dedup_hash,
      bank_account_id=bank_account_id,
      raw_id=raw_id,
      suggestions=suggestions,
      investment_kind=investment_kind,
      name=name,
      note=note,
      logo_url=logo_url,
      document_count=document_count,
      is_business=is_business,
      company_account=company_account,
      transfer_id=transfer_id,
    )

    transaction_rename_response.additional_properties = d
    return transaction_rename_response

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
