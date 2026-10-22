from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..models.rule_scope import RuleScope
from ..models.transaction_direction import TransactionDirection
from ..types import UNSET, Unset

T = TypeVar("T", bound="CategoryRuleCreate")


@_attrs_define
class CategoryRuleCreate:
  """
  Attributes:
      category_id (str):
      pattern (str):
      scope (RuleScope | Unset): Which accounts a rule looks at: the same text means different things on a company
          account.
      direction (None | TransactionDirection | Unset):
      mark_business (bool | Unset):  Default: False.
      apply_now (bool | Unset): Also sort the uncategorized transactions already imported. Default: True.
  """

  category_id: str
  pattern: str
  scope: RuleScope | Unset = UNSET
  direction: None | TransactionDirection | Unset = UNSET
  mark_business: bool | Unset = False
  apply_now: bool | Unset = True
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    category_id = self.category_id

    pattern = self.pattern

    scope: str | Unset = UNSET
    if not isinstance(self.scope, Unset):
      scope = self.scope.value

    direction: None | str | Unset
    if isinstance(self.direction, Unset):
      direction = UNSET
    elif isinstance(self.direction, TransactionDirection):
      direction = self.direction.value
    else:
      direction = self.direction

    mark_business = self.mark_business

    apply_now = self.apply_now

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "category_id": category_id,
        "pattern": pattern,
      }
    )
    if scope is not UNSET:
      field_dict["scope"] = scope
    if direction is not UNSET:
      field_dict["direction"] = direction
    if mark_business is not UNSET:
      field_dict["mark_business"] = mark_business
    if apply_now is not UNSET:
      field_dict["apply_now"] = apply_now

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    category_id = d.pop("category_id")

    pattern = d.pop("pattern")

    _scope = d.pop("scope", UNSET)
    scope: RuleScope | Unset
    if isinstance(_scope, Unset):
      scope = UNSET
    else:
      scope = RuleScope(_scope)

    def _parse_direction(data: object) -> None | TransactionDirection | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        direction_type_0 = TransactionDirection(data)

        return direction_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | TransactionDirection | Unset, data)

    direction = _parse_direction(d.pop("direction", UNSET))

    mark_business = d.pop("mark_business", UNSET)

    apply_now = d.pop("apply_now", UNSET)

    category_rule_create = cls(
      category_id=category_id,
      pattern=pattern,
      scope=scope,
      direction=direction,
      mark_business=mark_business,
      apply_now=apply_now,
    )

    category_rule_create.additional_properties = d
    return category_rule_create

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
