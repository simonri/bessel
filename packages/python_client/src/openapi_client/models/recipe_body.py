from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.recipe_ingredient_group import RecipeIngredientGroup
  from ..models.recipe_section import RecipeSection
  from ..models.recipe_step import RecipeStep


T = TypeVar("T", bound="RecipeBody")


@_attrs_define
class RecipeBody:
  """
  Attributes:
      intro (None | str | Unset):
      yield_text (None | str | Unset): e.g. '3 burgare (6 puckar à ca 85 g)'.
      total_minutes (int | None | Unset):
      active_minutes (int | None | Unset):
      ingredient_groups (list[RecipeIngredientGroup] | Unset):
      steps (list[RecipeStep] | Unset):
      sections (list[RecipeSection] | Unset):
  """

  intro: None | str | Unset = UNSET
  yield_text: None | str | Unset = UNSET
  total_minutes: int | None | Unset = UNSET
  active_minutes: int | None | Unset = UNSET
  ingredient_groups: list[RecipeIngredientGroup] | Unset = UNSET
  steps: list[RecipeStep] | Unset = UNSET
  sections: list[RecipeSection] | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    intro: None | str | Unset
    if isinstance(self.intro, Unset):
      intro = UNSET
    else:
      intro = self.intro

    yield_text: None | str | Unset
    if isinstance(self.yield_text, Unset):
      yield_text = UNSET
    else:
      yield_text = self.yield_text

    total_minutes: int | None | Unset
    if isinstance(self.total_minutes, Unset):
      total_minutes = UNSET
    else:
      total_minutes = self.total_minutes

    active_minutes: int | None | Unset
    if isinstance(self.active_minutes, Unset):
      active_minutes = UNSET
    else:
      active_minutes = self.active_minutes

    ingredient_groups: list[dict[str, Any]] | Unset = UNSET
    if not isinstance(self.ingredient_groups, Unset):
      ingredient_groups = []
      for ingredient_groups_item_data in self.ingredient_groups:
        ingredient_groups_item = ingredient_groups_item_data.to_dict()
        ingredient_groups.append(ingredient_groups_item)

    steps: list[dict[str, Any]] | Unset = UNSET
    if not isinstance(self.steps, Unset):
      steps = []
      for steps_item_data in self.steps:
        steps_item = steps_item_data.to_dict()
        steps.append(steps_item)

    sections: list[dict[str, Any]] | Unset = UNSET
    if not isinstance(self.sections, Unset):
      sections = []
      for sections_item_data in self.sections:
        sections_item = sections_item_data.to_dict()
        sections.append(sections_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if intro is not UNSET:
      field_dict["intro"] = intro
    if yield_text is not UNSET:
      field_dict["yield_text"] = yield_text
    if total_minutes is not UNSET:
      field_dict["total_minutes"] = total_minutes
    if active_minutes is not UNSET:
      field_dict["active_minutes"] = active_minutes
    if ingredient_groups is not UNSET:
      field_dict["ingredient_groups"] = ingredient_groups
    if steps is not UNSET:
      field_dict["steps"] = steps
    if sections is not UNSET:
      field_dict["sections"] = sections

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.recipe_ingredient_group import RecipeIngredientGroup
    from ..models.recipe_section import RecipeSection
    from ..models.recipe_step import RecipeStep

    d = dict(src_dict)

    def _parse_intro(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    intro = _parse_intro(d.pop("intro", UNSET))

    def _parse_yield_text(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    yield_text = _parse_yield_text(d.pop("yield_text", UNSET))

    def _parse_total_minutes(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    total_minutes = _parse_total_minutes(d.pop("total_minutes", UNSET))

    def _parse_active_minutes(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    active_minutes = _parse_active_minutes(d.pop("active_minutes", UNSET))

    _ingredient_groups = d.pop("ingredient_groups", UNSET)
    ingredient_groups: list[RecipeIngredientGroup] | Unset = UNSET
    if _ingredient_groups is not UNSET:
      ingredient_groups = []
      for ingredient_groups_item_data in _ingredient_groups:
        ingredient_groups_item = RecipeIngredientGroup.from_dict(ingredient_groups_item_data)

        ingredient_groups.append(ingredient_groups_item)

    _steps = d.pop("steps", UNSET)
    steps: list[RecipeStep] | Unset = UNSET
    if _steps is not UNSET:
      steps = []
      for steps_item_data in _steps:
        steps_item = RecipeStep.from_dict(steps_item_data)

        steps.append(steps_item)

    _sections = d.pop("sections", UNSET)
    sections: list[RecipeSection] | Unset = UNSET
    if _sections is not UNSET:
      sections = []
      for sections_item_data in _sections:
        sections_item = RecipeSection.from_dict(sections_item_data)

        sections.append(sections_item)

    recipe_body = cls(
      intro=intro,
      yield_text=yield_text,
      total_minutes=total_minutes,
      active_minutes=active_minutes,
      ingredient_groups=ingredient_groups,
      steps=steps,
      sections=sections,
    )

    recipe_body.additional_properties = d
    return recipe_body

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
