from datetime import date, datetime
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, model_validator

from api.common.schemas import Schema
from api.models.memory_fact import MemoryKind, MemorySensitivity, MemoryStatus

Area = Annotated[
  str,
  Field(
    min_length=1,
    max_length=100,
    pattern=r"^[^/\s][^/]*(/[^/\s][^/]*)*$",
    description=(
      "Where the fact belongs, as a path from general to specific, e.g. "
      + "'kropp/kläder', 'sömn', 'människor/familj', 'pengar/mål'. Reuse an existing area when one fits; "
      + "add a deeper one when it doesn't."
    ),
  ),
]
Attribute = Annotated[
  str,
  Field(
    min_length=1,
    max_length=200,
    description=(
      "What the fact is about, short and specific, e.g. 'skostorlek', 'insomning vardagar', 'mamma'. "
      + "One current fact per attribute within an area: a new value for it replaces the old one."
    ),
  ),
]
Statement = Annotated[str, Field(min_length=1, max_length=1000, description="The fact itself, one or two sentences.")]
Importance = Annotated[
  int,
  Field(ge=1, le=5, description="5 shapes most days and is always in the profile; 4 is in the profile; 1-3 are found by search."),
]


class Evidence(Schema):
  source: str = Field(max_length=50, description="Where it came from, e.g. 'user', 'sleep', 'calendar', 'tasks', 'gmail'.")
  ref: str | None = Field(default=None, max_length=200, description="What to look it up by: a date, an id or a link.")
  day: date | None = Field(default=None, description="The day it was seen or said.")
  note: str | None = Field(default=None, max_length=300, description="What it showed, in a few words.")


class MemoryFactSchema(Schema):
  id: UUID
  area: str
  attribute: str
  statement: str
  kind: MemoryKind
  status: MemoryStatus
  importance: int
  sensitivity: MemorySensitivity
  evidence: list[Evidence]
  valid_from: date | None
  valid_to: date | None = Field(description="Set once the fact stopped being true; empty while it holds.")
  superseded_by_id: UUID | None
  confirm_count: int
  confirmed_at: datetime | None
  created_at: datetime
  updated_at: datetime


class ProfileFact(Schema):
  id: UUID
  attribute: str
  statement: str
  status: MemoryStatus


class ProfileArea(Schema):
  area: str
  facts: list[ProfileFact]


class AreaCount(Schema):
  area: str
  facts: int


class SensitivityCount(Schema):
  sensitivity: MemorySensitivity
  facts: int


class MemoryProfile(Schema):
  profile: list[ProfileArea] = Field(description="What matters most (importance 4-5), by area: confirmed facts only, hypotheses are found by search.")
  areas: list[AreaCount] = Field(description="Every area known about, with how many current facts each holds.")
  recently_changed: list[ProfileFact] = Field(description="Facts added or changed in the last 7 days, newest first.")
  withheld: list[SensitivityCount] = Field(
    default_factory=list,
    description="Profile facts left out because they are sensitive; ask for a kind with `sensitive` when the task needs it.",
  )
  total_facts: int
  truncated: bool = Field(description="True when the profile hit its size limit; search_memory finds the rest.")


class NewFact(Schema):
  area: Area
  attribute: Attribute
  statement: Statement
  kind: MemoryKind = Field(
    description="stated: the user said it. observed: seen in their data. inferred: your conclusion. corrected: the user fixed it.",
  )
  status: MemoryStatus | None = Field(
    default=None,
    description="Leave empty: inferred facts start as hypotheses, everything else as confirmed.",
  )
  importance: Importance = 3
  sensitivity: MemorySensitivity = MemorySensitivity.normal
  evidence: list[Evidence] = Field(default_factory=list, max_length=10)
  valid_from: date | None = Field(default=None, description="Since when it has been true, if known.")
  based_on: list[UUID] = Field(
    default_factory=list,
    max_length=20,
    description=(
      "The current facts you checked this against. Required for an inferred fact: search memory for everything that "
      + "bears on the conclusion (where they live, what they pay, what they said) before drawing it."
    ),
  )

  @model_validator(mode="after")
  def _inference_is_checked(self) -> Self:
    if self.kind == MemoryKind.inferred and not self.based_on:
      raise ValueError("An inferred fact needs based_on: search memory for what bears on it, then list the facts you checked")
    return self


RememberOutcome = Literal["added", "known", "conflict"]


class RememberResult(Schema):
  outcome: RememberOutcome = Field(
    description=(
      "added: stored. known: the same fact was already there, so it was confirmed and its evidence merged. "
      + "conflict: another fact about this attribute is current; nothing was stored, use revise_memory on it."
    ),
  )
  fact: MemoryFactSchema
  similar: list[ProfileFact] = Field(
    default_factory=list,
    description="Current facts that look related. Merge into one of them with revise_memory instead of keeping both.",
  )


class RememberResponse(Schema):
  results: list[RememberResult]


ReviseAction = Literal["confirm", "update", "supersede", "merge", "reject", "end"]


class FactChange(Schema):
  fact_id: UUID
  action: ReviseAction = Field(
    description=(
      "confirm: still true (adds evidence, makes a hypothesis confirmed). update: fix it in place (wording, area, importance). "
      + "supersede: it changed; the old one closes and the new statement takes over. "
      + "merge: fold this fact into into_id, which keeps one combined statement. reject: a hypothesis turned out wrong. "
      + "end: no longer true and nothing replaces it."
    ),
  )
  statement: Statement | None = Field(default=None, description="The new wording, for update, supersede or the merged fact.")
  area: Area | None = None
  attribute: Attribute | None = None
  importance: Importance | None = None
  sensitivity: MemorySensitivity | None = None
  kind: MemoryKind | None = Field(default=None, description="For supersede and update, e.g. 'corrected' when the user fixed it.")
  evidence: list[Evidence] = Field(default_factory=list, max_length=10)
  into_id: UUID | None = Field(default=None, description="For merge: the fact that stays.")
  ended_on: date | None = Field(default=None, description="For end and supersede: when it stopped being true. Defaults to today.")


class ReviseResult(Schema):
  fact_id: UUID
  action: ReviseAction
  error: str | None = Field(default=None, description="Why this change was not made; the others still were.")
  fact: MemoryFactSchema | None = Field(default=None, description="The fact that holds now after the change.")


class ReviseResponse(Schema):
  results: list[ReviseResult]


class MemoryFactsResponse(Schema):
  facts: list[MemoryFactSchema]


class MemoryFactUpdate(Schema):
  """A correction from the user on the web."""

  area: Area | None = None
  attribute: Attribute | None = None
  statement: Statement | None = None
  importance: Importance | None = None
