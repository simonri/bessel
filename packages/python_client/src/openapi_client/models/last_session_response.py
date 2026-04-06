from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.last_session_best_set import LastSessionBestSet
  from ..models.last_session_set_schema import LastSessionSetSchema


T = TypeVar("T", bound="LastSessionResponse")


@_attrs_define
class LastSessionResponse:
  """
  Attributes:
      sets (list[LastSessionSetSchema]):
      best_set (LastSessionBestSet | None):
  """

  sets: list[LastSessionSetSchema]
  best_set: LastSessionBestSet | None
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.last_session_best_set import LastSessionBestSet

    sets = []
    for sets_item_data in self.sets:
      sets_item = sets_item_data.to_dict()
      sets.append(sets_item)

    best_set: dict[str, Any] | None
    if isinstance(self.best_set, LastSessionBestSet):
      best_set = self.best_set.to_dict()
    else:
      best_set = self.best_set

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "sets": sets,
        "best_set": best_set,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.last_session_best_set import LastSessionBestSet
    from ..models.last_session_set_schema import LastSessionSetSchema

    d = dict(src_dict)
    sets = []
    _sets = d.pop("sets")
    for sets_item_data in _sets:
      sets_item = LastSessionSetSchema.from_dict(sets_item_data)

      sets.append(sets_item)

    def _parse_best_set(data: object) -> LastSessionBestSet | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        best_set_type_0 = LastSessionBestSet.from_dict(data)

        return best_set_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(LastSessionBestSet | None, data)

    best_set = _parse_best_set(d.pop("best_set"))

    last_session_response = cls(
      sets=sets,
      best_set=best_set,
    )

    last_session_response.additional_properties = d
    return last_session_response

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
