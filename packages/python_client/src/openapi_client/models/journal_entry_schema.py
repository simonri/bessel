from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.journal_entry_schema_captures_type_0_item import JournalEntrySchemaCapturesType0Item


T = TypeVar("T", bound="JournalEntrySchema")


@_attrs_define
class JournalEntrySchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      entry_date (datetime.date): Calendar date for this entry.
      priority (None | str | Unset): The one thing today.
      friction (None | str | Unset): What might stop me.
      gratitude_1 (None | str | Unset): Gratitude bullet 1.
      gratitude_2 (None | str | Unset): Gratitude bullet 2.
      gratitude_3 (None | str | Unset): Gratitude bullet 3.
      morning_committed_at (datetime.datetime | None | Unset): When morning was committed.
      captures (list[JournalEntrySchemaCapturesType0Item] | None | Unset): Captured thoughts.
      scorecard (int | None | Unset): Day rating 1-5.
      priority_done (bool | None | Unset): Did the priority get done.
      insight (None | str | Unset): What did I learn today.
      seed (None | str | Unset): Problem for tomorrow.
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  entry_date: datetime.date
  priority: None | str | Unset = UNSET
  friction: None | str | Unset = UNSET
  gratitude_1: None | str | Unset = UNSET
  gratitude_2: None | str | Unset = UNSET
  gratitude_3: None | str | Unset = UNSET
  morning_committed_at: datetime.datetime | None | Unset = UNSET
  captures: list[JournalEntrySchemaCapturesType0Item] | None | Unset = UNSET
  scorecard: int | None | Unset = UNSET
  priority_done: bool | None | Unset = UNSET
  insight: None | str | Unset = UNSET
  seed: None | str | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    created_at = self.created_at.isoformat()

    modified_at: None | str
    if isinstance(self.modified_at, datetime.datetime):
      modified_at = self.modified_at.isoformat()
    else:
      modified_at = self.modified_at

    id = self.id

    entry_date = self.entry_date.isoformat()

    priority: None | str | Unset
    if isinstance(self.priority, Unset):
      priority = UNSET
    else:
      priority = self.priority

    friction: None | str | Unset
    if isinstance(self.friction, Unset):
      friction = UNSET
    else:
      friction = self.friction

    gratitude_1: None | str | Unset
    if isinstance(self.gratitude_1, Unset):
      gratitude_1 = UNSET
    else:
      gratitude_1 = self.gratitude_1

    gratitude_2: None | str | Unset
    if isinstance(self.gratitude_2, Unset):
      gratitude_2 = UNSET
    else:
      gratitude_2 = self.gratitude_2

    gratitude_3: None | str | Unset
    if isinstance(self.gratitude_3, Unset):
      gratitude_3 = UNSET
    else:
      gratitude_3 = self.gratitude_3

    morning_committed_at: None | str | Unset
    if isinstance(self.morning_committed_at, Unset):
      morning_committed_at = UNSET
    elif isinstance(self.morning_committed_at, datetime.datetime):
      morning_committed_at = self.morning_committed_at.isoformat()
    else:
      morning_committed_at = self.morning_committed_at

    captures: list[dict[str, Any]] | None | Unset
    if isinstance(self.captures, Unset):
      captures = UNSET
    elif isinstance(self.captures, list):
      captures = []
      for captures_type_0_item_data in self.captures:
        captures_type_0_item = captures_type_0_item_data.to_dict()
        captures.append(captures_type_0_item)

    else:
      captures = self.captures

    scorecard: int | None | Unset
    if isinstance(self.scorecard, Unset):
      scorecard = UNSET
    else:
      scorecard = self.scorecard

    priority_done: bool | None | Unset
    if isinstance(self.priority_done, Unset):
      priority_done = UNSET
    else:
      priority_done = self.priority_done

    insight: None | str | Unset
    if isinstance(self.insight, Unset):
      insight = UNSET
    else:
      insight = self.insight

    seed: None | str | Unset
    if isinstance(self.seed, Unset):
      seed = UNSET
    else:
      seed = self.seed

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "created_at": created_at,
        "modified_at": modified_at,
        "id": id,
        "entry_date": entry_date,
      }
    )
    if priority is not UNSET:
      field_dict["priority"] = priority
    if friction is not UNSET:
      field_dict["friction"] = friction
    if gratitude_1 is not UNSET:
      field_dict["gratitude_1"] = gratitude_1
    if gratitude_2 is not UNSET:
      field_dict["gratitude_2"] = gratitude_2
    if gratitude_3 is not UNSET:
      field_dict["gratitude_3"] = gratitude_3
    if morning_committed_at is not UNSET:
      field_dict["morning_committed_at"] = morning_committed_at
    if captures is not UNSET:
      field_dict["captures"] = captures
    if scorecard is not UNSET:
      field_dict["scorecard"] = scorecard
    if priority_done is not UNSET:
      field_dict["priority_done"] = priority_done
    if insight is not UNSET:
      field_dict["insight"] = insight
    if seed is not UNSET:
      field_dict["seed"] = seed

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.journal_entry_schema_captures_type_0_item import JournalEntrySchemaCapturesType0Item

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

    entry_date = datetime.date.fromisoformat(d.pop("entry_date"))

    def _parse_priority(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    priority = _parse_priority(d.pop("priority", UNSET))

    def _parse_friction(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    friction = _parse_friction(d.pop("friction", UNSET))

    def _parse_gratitude_1(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    gratitude_1 = _parse_gratitude_1(d.pop("gratitude_1", UNSET))

    def _parse_gratitude_2(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    gratitude_2 = _parse_gratitude_2(d.pop("gratitude_2", UNSET))

    def _parse_gratitude_3(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    gratitude_3 = _parse_gratitude_3(d.pop("gratitude_3", UNSET))

    def _parse_morning_committed_at(data: object) -> datetime.datetime | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, str):
          raise TypeError()
        morning_committed_at_type_0 = datetime.datetime.fromisoformat(data)

        return morning_committed_at_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(datetime.datetime | None | Unset, data)

    morning_committed_at = _parse_morning_committed_at(d.pop("morning_committed_at", UNSET))

    def _parse_captures(data: object) -> list[JournalEntrySchemaCapturesType0Item] | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, list):
          raise TypeError()
        captures_type_0 = []
        _captures_type_0 = data
        for captures_type_0_item_data in _captures_type_0:
          captures_type_0_item = JournalEntrySchemaCapturesType0Item.from_dict(captures_type_0_item_data)

          captures_type_0.append(captures_type_0_item)

        return captures_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(list[JournalEntrySchemaCapturesType0Item] | None | Unset, data)

    captures = _parse_captures(d.pop("captures", UNSET))

    def _parse_scorecard(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    scorecard = _parse_scorecard(d.pop("scorecard", UNSET))

    def _parse_priority_done(data: object) -> bool | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(bool | None | Unset, data)

    priority_done = _parse_priority_done(d.pop("priority_done", UNSET))

    def _parse_insight(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    insight = _parse_insight(d.pop("insight", UNSET))

    def _parse_seed(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    seed = _parse_seed(d.pop("seed", UNSET))

    journal_entry_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      entry_date=entry_date,
      priority=priority,
      friction=friction,
      gratitude_1=gratitude_1,
      gratitude_2=gratitude_2,
      gratitude_3=gratitude_3,
      morning_committed_at=morning_committed_at,
      captures=captures,
      scorecard=scorecard,
      priority_done=priority_done,
      insight=insight,
      seed=seed,
    )

    journal_entry_schema.additional_properties = d
    return journal_entry_schema

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
