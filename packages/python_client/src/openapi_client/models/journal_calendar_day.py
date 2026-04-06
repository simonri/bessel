from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="JournalCalendarDay")


@_attrs_define
class JournalCalendarDay:
  """
  Attributes:
      entry_date (datetime.date):
      mood (int | None | Unset):
      word_count (int | Unset):  Default: 0.
      has_wins (bool | Unset):  Default: False.
      has_learnings (bool | Unset):  Default: False.
  """

  entry_date: datetime.date
  mood: int | None | Unset = UNSET
  word_count: int | Unset = 0
  has_wins: bool | Unset = False
  has_learnings: bool | Unset = False
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    entry_date = self.entry_date.isoformat()

    mood: int | None | Unset
    if isinstance(self.mood, Unset):
      mood = UNSET
    else:
      mood = self.mood

    word_count = self.word_count

    has_wins = self.has_wins

    has_learnings = self.has_learnings

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "entry_date": entry_date,
      }
    )
    if mood is not UNSET:
      field_dict["mood"] = mood
    if word_count is not UNSET:
      field_dict["word_count"] = word_count
    if has_wins is not UNSET:
      field_dict["has_wins"] = has_wins
    if has_learnings is not UNSET:
      field_dict["has_learnings"] = has_learnings

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    d = dict(src_dict)
    entry_date = isoparse(d.pop("entry_date")).date()

    def _parse_mood(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    mood = _parse_mood(d.pop("mood", UNSET))

    word_count = d.pop("word_count", UNSET)

    has_wins = d.pop("has_wins", UNSET)

    has_learnings = d.pop("has_learnings", UNSET)

    journal_calendar_day = cls(
      entry_date=entry_date,
      mood=mood,
      word_count=word_count,
      has_wins=has_wins,
      has_learnings=has_learnings,
    )

    journal_calendar_day.additional_properties = d
    return journal_calendar_day

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
