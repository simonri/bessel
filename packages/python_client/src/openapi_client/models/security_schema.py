from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.asset_type import AssetType

T = TypeVar("T", bound="SecuritySchema")


@_attrs_define
class SecuritySchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      name (str):
      ticker (None | str):
      asset_type (AssetType):
      currency (str):
      notes (None | str):
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  name: str
  ticker: None | str
  asset_type: AssetType
  currency: str
  notes: None | str
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    name = self.name

    ticker: None | str
    ticker = self.ticker

    asset_type = self.asset_type.value

    currency = self.currency

    notes: None | str
    notes = self.notes

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "name": name,
        "ticker": ticker,
        "asset_type": asset_type,
        "currency": currency,
        "notes": notes,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
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

    name = d.pop("name")

    def _parse_ticker(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    ticker = _parse_ticker(d.pop("ticker"))

    asset_type = AssetType(d.pop("asset_type"))

    currency = d.pop("currency")

    def _parse_notes(data: object) -> None | str:
      if data is None:
        return data
      return cast(None | str, data)

    notes = _parse_notes(d.pop("notes"))

    security_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      name=name,
      ticker=ticker,
      asset_type=asset_type,
      currency=currency,
      notes=notes,
    )

    security_schema.additional_properties = d
    return security_schema

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
