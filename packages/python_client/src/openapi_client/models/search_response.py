from __future__ import annotations

from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.event_hit import EventHit
  from ..models.place_hit import PlaceHit
  from ..models.recipe_hit import RecipeHit
  from ..models.task_hit import TaskHit


T = TypeVar("T", bound="SearchResponse")


@_attrs_define
class SearchResponse:
  """
  Attributes:
      tasks (list[TaskHit]):
      recipes (list[RecipeHit]):
      events (list[EventHit]):
      places (list[PlaceHit]):
  """

  tasks: list[TaskHit]
  recipes: list[RecipeHit]
  events: list[EventHit]
  places: list[PlaceHit]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    tasks = []
    for tasks_item_data in self.tasks:
      tasks_item = tasks_item_data.to_dict()
      tasks.append(tasks_item)

    recipes = []
    for recipes_item_data in self.recipes:
      recipes_item = recipes_item_data.to_dict()
      recipes.append(recipes_item)

    events = []
    for events_item_data in self.events:
      events_item = events_item_data.to_dict()
      events.append(events_item)

    places = []
    for places_item_data in self.places:
      places_item = places_item_data.to_dict()
      places.append(places_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "tasks": tasks,
        "recipes": recipes,
        "events": events,
        "places": places,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.event_hit import EventHit
    from ..models.place_hit import PlaceHit
    from ..models.recipe_hit import RecipeHit
    from ..models.task_hit import TaskHit

    d = dict(src_dict)
    tasks = []
    _tasks = d.pop("tasks")
    for tasks_item_data in _tasks:
      tasks_item = TaskHit.from_dict(tasks_item_data)

      tasks.append(tasks_item)

    recipes = []
    _recipes = d.pop("recipes")
    for recipes_item_data in _recipes:
      recipes_item = RecipeHit.from_dict(recipes_item_data)

      recipes.append(recipes_item)

    events = []
    _events = d.pop("events")
    for events_item_data in _events:
      events_item = EventHit.from_dict(events_item_data)

      events.append(events_item)

    places = []
    _places = d.pop("places")
    for places_item_data in _places:
      places_item = PlaceHit.from_dict(places_item_data)

      places.append(places_item)

    search_response = cls(
      tasks=tasks,
      recipes=recipes,
      events=events,
      places=places,
    )

    search_response.additional_properties = d
    return search_response

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
