from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field
from dateutil.parser import isoparse

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.journal_entry_schema_decisions_type_0_item import JournalEntrySchemaDecisionsType0Item


T = TypeVar("T", bound="JournalEntrySchema")


@_attrs_define
class JournalEntrySchema:
  """
  Attributes:
      created_at (datetime.datetime): Creation timestamp of the object.
      modified_at (datetime.datetime | None): Last modification timestamp of the object.
      id (str): The ID of the object.
      entry_date (datetime.date): Calendar date for this entry.
      body (None | str | Unset): Free-form markdown body.
      mood (int | None | Unset): Mood rating 1-5.
      energy (int | None | Unset): Energy rating 1-5.
      focus (int | None | Unset): Focus quality 1-5.
      sleep_hours (float | None | Unset): Hours of sleep.
      wins (None | str | Unset): Wins for the day.
      blockers (None | str | Unset): Blockers / challenges.
      learnings (None | str | Unset): Key learnings.
      gratitude (None | str | Unset): Gratitude notes.
      intention (None | str | Unset): Intention for tomorrow.
      decisions (list[JournalEntrySchemaDecisionsType0Item] | None | Unset): Decisions log.
      tags (list[str] | None | Unset): Tags.
      word_count (int | Unset): Word count of body. Default: 0.
  """

  created_at: datetime.datetime
  modified_at: datetime.datetime | None
  id: str
  entry_date: datetime.date
  body: None | str | Unset = UNSET
  mood: int | None | Unset = UNSET
  energy: int | None | Unset = UNSET
  focus: int | None | Unset = UNSET
  sleep_hours: float | None | Unset = UNSET
  wins: None | str | Unset = UNSET
  blockers: None | str | Unset = UNSET
  learnings: None | str | Unset = UNSET
  gratitude: None | str | Unset = UNSET
  intention: None | str | Unset = UNSET
  decisions: list[JournalEntrySchemaDecisionsType0Item] | None | Unset = UNSET
  tags: list[str] | None | Unset = UNSET
  word_count: int | Unset = 0
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

    body: None | str | Unset
    if isinstance(self.body, Unset):
      body = UNSET
    else:
      body = self.body

    mood: int | None | Unset
    if isinstance(self.mood, Unset):
      mood = UNSET
    else:
      mood = self.mood

    energy: int | None | Unset
    if isinstance(self.energy, Unset):
      energy = UNSET
    else:
      energy = self.energy

    focus: int | None | Unset
    if isinstance(self.focus, Unset):
      focus = UNSET
    else:
      focus = self.focus

    sleep_hours: float | None | Unset
    if isinstance(self.sleep_hours, Unset):
      sleep_hours = UNSET
    else:
      sleep_hours = self.sleep_hours

    wins: None | str | Unset
    if isinstance(self.wins, Unset):
      wins = UNSET
    else:
      wins = self.wins

    blockers: None | str | Unset
    if isinstance(self.blockers, Unset):
      blockers = UNSET
    else:
      blockers = self.blockers

    learnings: None | str | Unset
    if isinstance(self.learnings, Unset):
      learnings = UNSET
    else:
      learnings = self.learnings

    gratitude: None | str | Unset
    if isinstance(self.gratitude, Unset):
      gratitude = UNSET
    else:
      gratitude = self.gratitude

    intention: None | str | Unset
    if isinstance(self.intention, Unset):
      intention = UNSET
    else:
      intention = self.intention

    decisions: list[dict[str, Any]] | None | Unset
    if isinstance(self.decisions, Unset):
      decisions = UNSET
    elif isinstance(self.decisions, list):
      decisions = []
      for decisions_type_0_item_data in self.decisions:
        decisions_type_0_item = decisions_type_0_item_data.to_dict()
        decisions.append(decisions_type_0_item)

    else:
      decisions = self.decisions

    tags: list[str] | None | Unset
    if isinstance(self.tags, Unset):
      tags = UNSET
    elif isinstance(self.tags, list):
      tags = self.tags

    else:
      tags = self.tags

    word_count = self.word_count

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
    if body is not UNSET:
      field_dict["body"] = body
    if mood is not UNSET:
      field_dict["mood"] = mood
    if energy is not UNSET:
      field_dict["energy"] = energy
    if focus is not UNSET:
      field_dict["focus"] = focus
    if sleep_hours is not UNSET:
      field_dict["sleep_hours"] = sleep_hours
    if wins is not UNSET:
      field_dict["wins"] = wins
    if blockers is not UNSET:
      field_dict["blockers"] = blockers
    if learnings is not UNSET:
      field_dict["learnings"] = learnings
    if gratitude is not UNSET:
      field_dict["gratitude"] = gratitude
    if intention is not UNSET:
      field_dict["intention"] = intention
    if decisions is not UNSET:
      field_dict["decisions"] = decisions
    if tags is not UNSET:
      field_dict["tags"] = tags
    if word_count is not UNSET:
      field_dict["word_count"] = word_count

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.journal_entry_schema_decisions_type_0_item import JournalEntrySchemaDecisionsType0Item

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

    entry_date = isoparse(d.pop("entry_date")).date()

    def _parse_body(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    body = _parse_body(d.pop("body", UNSET))

    def _parse_mood(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    mood = _parse_mood(d.pop("mood", UNSET))

    def _parse_energy(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    energy = _parse_energy(d.pop("energy", UNSET))

    def _parse_focus(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    focus = _parse_focus(d.pop("focus", UNSET))

    def _parse_sleep_hours(data: object) -> float | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(float | None | Unset, data)

    sleep_hours = _parse_sleep_hours(d.pop("sleep_hours", UNSET))

    def _parse_wins(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    wins = _parse_wins(d.pop("wins", UNSET))

    def _parse_blockers(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    blockers = _parse_blockers(d.pop("blockers", UNSET))

    def _parse_learnings(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    learnings = _parse_learnings(d.pop("learnings", UNSET))

    def _parse_gratitude(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    gratitude = _parse_gratitude(d.pop("gratitude", UNSET))

    def _parse_intention(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    intention = _parse_intention(d.pop("intention", UNSET))

    def _parse_decisions(data: object) -> list[JournalEntrySchemaDecisionsType0Item] | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, list):
          raise TypeError()
        decisions_type_0 = []
        _decisions_type_0 = data
        for decisions_type_0_item_data in _decisions_type_0:
          decisions_type_0_item = JournalEntrySchemaDecisionsType0Item.from_dict(decisions_type_0_item_data)

          decisions_type_0.append(decisions_type_0_item)

        return decisions_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(list[JournalEntrySchemaDecisionsType0Item] | None | Unset, data)

    decisions = _parse_decisions(d.pop("decisions", UNSET))

    def _parse_tags(data: object) -> list[str] | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      try:
        if not isinstance(data, list):
          raise TypeError()
        tags_type_0 = cast(list[str], data)

        return tags_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(list[str] | None | Unset, data)

    tags = _parse_tags(d.pop("tags", UNSET))

    word_count = d.pop("word_count", UNSET)

    journal_entry_schema = cls(
      created_at=created_at,
      modified_at=modified_at,
      id=id,
      entry_date=entry_date,
      body=body,
      mood=mood,
      energy=energy,
      focus=focus,
      sleep_hours=sleep_hours,
      wins=wins,
      blockers=blockers,
      learnings=learnings,
      gratitude=gratitude,
      intention=intention,
      decisions=decisions,
      tags=tags,
      word_count=word_count,
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
