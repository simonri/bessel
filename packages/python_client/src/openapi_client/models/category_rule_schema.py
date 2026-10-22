from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.rule_scope import RuleScope
from ..models.transaction_direction import TransactionDirection

T = TypeVar("T", bound="CategoryRuleSchema")


@_attrs_define
class CategoryRuleSchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      category_id (str):
      pattern (str): Text matched case-insensitively anywhere in the description.
      scope (RuleScope): Which accounts a rule looks at: the same text means different things on a company account.
      direction (None | TransactionDirection): Only money in (credit) or out (debit), or both when null.
      mark_business (bool): Also mark matching transactions as business expenses.
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  category_id: str
  pattern: str
  scope: RuleScope
  direction: None | TransactionDirection
  mark_business: bool
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    category_id = self.category_id

    pattern = self.pattern

    scope = self.scope.value

    direction: None | str
    if isinstance(self.direction, TransactionDirection):
      direction = self.direction.value
    else:
      direction = self.direction

    mark_business = self.mark_business

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "category_id": category_id,
        "pattern": pattern,
        "scope": scope,
        "direction": direction,
        "mark_business": mark_business,
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

    category_id = d.pop("category_id")

    pattern = d.pop("pattern")

    scope = RuleScope(d.pop("scope"))

    def _parse_direction(data: object) -> None | TransactionDirection:
      if data is None:
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        direction_type_0 = TransactionDirection(data)

        return direction_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | TransactionDirection, data)

    direction = _parse_direction(d.pop("direction"))

    mark_business = d.pop("mark_business")

    category_rule_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      category_id=category_id,
      pattern=pattern,
      scope=scope,
      direction=direction,
      mark_business=mark_business,
    )

    category_rule_schema.additional_properties = d
    return category_rule_schema

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
