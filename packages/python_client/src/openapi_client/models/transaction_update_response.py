from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..models.transaction_direction import TransactionDirection
from ..types import UNSET, Unset

T = TypeVar("T", bound="TransactionUpdateResponse")


@_attrs_define
class TransactionUpdateResponse:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      amount (int): Amount in minor units (cents).
      currency (str):
      transaction_date (datetime.date):
      direction (TransactionDirection):
      description (None | str):
      category_id (None | str):
      transaction_type (None | str):
      dedup_hash (str):
      bank_account_id (str):
      raw_id (None | str):
      is_business (bool | Unset): Whether this is a business transaction. Default: False.
      same_description_count (int | Unset): Number of other transactions with the same description not yet assigned
          this category. Default: 0.
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
  is_business: bool | Unset = False
  same_description_count: int | Unset = 0
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

    is_business = self.is_business

    same_description_count = self.same_description_count

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
      }
    )
    if is_business is not UNSET:
      field_dict["is_business"] = is_business
    if same_description_count is not UNSET:
      field_dict["same_description_count"] = same_description_count

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    created_at = isoparse(d.pop("created_at"))

    def _parse_modified_at(data: object) -> datetime.datetime | None:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        modified_at_type_0 = isoparse(data)

        return modified_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None, data)

    modified_at = _parse_modified_at(d.pop("modified_at"))

    id = d.pop("id")

    amount = d.pop("amount")

    currency = d.pop("currency")

    transaction_date = isoparse(d.pop("transaction_date")).date()

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

    is_business = d.pop("is_business", UNSET)

    same_description_count = d.pop("same_description_count", UNSET)

    transaction_update_response = cls(
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
      is_business=is_business,
      same_description_count=same_description_count,
    )

    transaction_update_response.additional_properties = d
    return transaction_update_response

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
