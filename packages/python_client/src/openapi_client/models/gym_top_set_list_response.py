from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.gym_top_set_schema import GymTopSetSchema


T = TypeVar("T", bound="GymTopSetListResponse")


@_attrs_define
class GymTopSetListResponse:
  """
  Attributes:
      sets (list[GymTopSetSchema]): Every top set of the exercise, oldest first.
  """

  sets: list[GymTopSetSchema]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    sets = []
    for sets_item_data in self.sets:
      sets_item = sets_item_data.to_dict()
      sets.append(sets_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "sets": sets,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.gym_top_set_schema import GymTopSetSchema

    d = dict(src_dict)
    sets = []
    _sets = d.pop("sets")
    for sets_item_data in _sets:
      sets_item = GymTopSetSchema.from_dict(sets_item_data)

      sets.append(sets_item)

    gym_top_set_list_response = cls(
      sets=sets,
    )

    gym_top_set_list_response.additional_properties = d
    return gym_top_set_list_response

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
