from __future__ import annotations

from collections.abc import Mapping
from typing import Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

T = TypeVar("T", bound="JournalStreakResponse")


@_attrs_define
class JournalStreakResponse:
  """
  Attributes:
      current_streak (int):
      longest_streak (int):
      total_entries (int):
  """

  current_streak: int
  longest_streak: int
  total_entries: int
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    current_streak = self.current_streak

    longest_streak = self.longest_streak

    total_entries = self.total_entries

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "total_entries": total_entries,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    current_streak = d.pop("current_streak")

    longest_streak = d.pop("longest_streak")

    total_entries = d.pop("total_entries")

    journal_streak_response = cls(
      current_streak=current_streak,
      longest_streak=longest_streak,
      total_entries=total_entries,
    )

    journal_streak_response.additional_properties = d
    return journal_streak_response

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
