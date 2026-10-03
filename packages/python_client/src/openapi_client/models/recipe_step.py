from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
  from ..models.recipe_callout import RecipeCallout


T = TypeVar("T", bound="RecipeStep")


@_attrs_define
class RecipeStep:
  """
  Attributes:
      title (None | str | Unset):
      text (str | Unset): Markdown. Default: ''.
      time_label (None | str | Unset): e.g. '5 min + 30 min i kyl'.
      timer_minutes (int | None | Unset):
      callouts (list[RecipeCallout] | Unset):
  """

  title: None | str | Unset = UNSET
  text: str | Unset = ''
  time_label: None | str | Unset = UNSET
  timer_minutes: int | None | Unset = UNSET
  callouts: list[RecipeCallout] | Unset = UNSET
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    title: None | str | Unset
    if isinstance(self.title, Unset):
      title = UNSET
    else:
      title = self.title

    text = self.text

    time_label: None | str | Unset
    if isinstance(self.time_label, Unset):
      time_label = UNSET
    else:
      time_label = self.time_label

    timer_minutes: int | None | Unset
    if isinstance(self.timer_minutes, Unset):
      timer_minutes = UNSET
    else:
      timer_minutes = self.timer_minutes

    callouts: list[dict[str, Any]] | Unset = UNSET
    if not isinstance(self.callouts, Unset):
      callouts = []
      for callouts_item_data in self.callouts:
        callouts_item = callouts_item_data.to_dict()
        callouts.append(callouts_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update({})
    if title is not UNSET:
      field_dict["title"] = title
    if text is not UNSET:
      field_dict["text"] = text
    if time_label is not UNSET:
      field_dict["time_label"] = time_label
    if timer_minutes is not UNSET:
      field_dict["timer_minutes"] = timer_minutes
    if callouts is not UNSET:
      field_dict["callouts"] = callouts

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.recipe_callout import RecipeCallout

    d = dict(src_dict)

    def _parse_title(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    title = _parse_title(d.pop("title", UNSET))

    text = d.pop("text", UNSET)

    def _parse_time_label(data: object) -> None | str | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(None | str | Unset, data)

    time_label = _parse_time_label(d.pop("time_label", UNSET))

    def _parse_timer_minutes(data: object) -> int | None | Unset:
      if data is None:
        return data
      if isinstance(data, Unset):
        return data
      return cast(int | None | Unset, data)

    timer_minutes = _parse_timer_minutes(d.pop("timer_minutes", UNSET))

    _callouts = d.pop("callouts", UNSET)
    callouts: list[RecipeCallout] | Unset = UNSET
    if _callouts is not UNSET:
      callouts = []
      for callouts_item_data in _callouts:
        callouts_item = RecipeCallout.from_dict(callouts_item_data)

        callouts.append(callouts_item)

    recipe_step = cls(
      title=title,
      text=text,
      time_label=time_label,
      timer_minutes=timer_minutes,
      callouts=callouts,
    )

    recipe_step.additional_properties = d
    return recipe_step

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
