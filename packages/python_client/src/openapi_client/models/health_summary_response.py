from __future__ import annotations

import datetime
from collections.abc import Mapping
from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

if TYPE_CHECKING:
  from ..models.energy_day_summary import EnergyDaySummary
  from ..models.health_week_day import HealthWeekDay
  from ..models.move_day_summary import MoveDaySummary
  from ..models.sleep_day_summary import SleepDaySummary


T = TypeVar("T", bound="HealthSummaryResponse")


@_attrs_define
class HealthSummaryResponse:
  """
  Attributes:
      date (datetime.date):
      is_today (bool):
      sleep (None | SleepDaySummary): The night that ended on this date; null if none was recorded.
      move (MoveDaySummary | None): Null when there's no activity data at all yet.
      energy (EnergyDaySummary | None): Null when no heart data has been recorded (no Apple Watch).
      insight (str): One friendly sentence about the day.
      bedtime_streak (int): Nights in a row, ending this date, that began within 45 minutes of the usual bedtime.
      week (list[HealthWeekDay]): The seven days ending on this date, oldest first.
  """

  date: datetime.date
  is_today: bool
  sleep: None | SleepDaySummary
  move: MoveDaySummary | None
  energy: EnergyDaySummary | None
  insight: str
  bedtime_streak: int
  week: list[HealthWeekDay]
  additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

  def to_dict(self) -> dict[str, Any]:
    from ..models.energy_day_summary import EnergyDaySummary
    from ..models.move_day_summary import MoveDaySummary
    from ..models.sleep_day_summary import SleepDaySummary

    date = self.date.isoformat()

    is_today = self.is_today

    sleep: dict[str, Any] | None
    if isinstance(self.sleep, SleepDaySummary):
      sleep = self.sleep.to_dict()
    else:
      sleep = self.sleep

    move: dict[str, Any] | None
    if isinstance(self.move, MoveDaySummary):
      move = self.move.to_dict()
    else:
      move = self.move

    energy: dict[str, Any] | None
    if isinstance(self.energy, EnergyDaySummary):
      energy = self.energy.to_dict()
    else:
      energy = self.energy

    insight = self.insight

    bedtime_streak = self.bedtime_streak

    week = []
    for week_item_data in self.week:
      week_item = week_item_data.to_dict()
      week.append(week_item)

    field_dict: dict[str, Any] = {}
    field_dict.update(self.additional_properties)
    field_dict.update(
      {
        "date": date,
        "is_today": is_today,
        "sleep": sleep,
        "move": move,
        "energy": energy,
        "insight": insight,
        "bedtime_streak": bedtime_streak,
        "week": week,
      }
    )

    return field_dict

  @classmethod
  def from_dict(cls: type[T], src_dict: Mapping[str, Any]) -> T:
    from ..models.energy_day_summary import EnergyDaySummary
    from ..models.health_week_day import HealthWeekDay
    from ..models.move_day_summary import MoveDaySummary
    from ..models.sleep_day_summary import SleepDaySummary

    d = dict(src_dict)
    date = datetime.date.fromisoformat(d.pop("date"))

    is_today = d.pop("is_today")

    def _parse_sleep(data: object) -> None | SleepDaySummary:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        sleep_type_0 = SleepDaySummary.from_dict(data)

        return sleep_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(None | SleepDaySummary, data)

    sleep = _parse_sleep(d.pop("sleep"))

    def _parse_move(data: object) -> MoveDaySummary | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        move_type_0 = MoveDaySummary.from_dict(data)

        return move_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(MoveDaySummary | None, data)

    move = _parse_move(d.pop("move"))

    def _parse_energy(data: object) -> EnergyDaySummary | None:
      if data is None:
        return data
      try:
        if not isinstance(data, dict):
          raise TypeError()
        energy_type_0 = EnergyDaySummary.from_dict(data)

        return energy_type_0
      except (TypeError, ValueError, AttributeError, KeyError):
        pass
      return cast(EnergyDaySummary | None, data)

    energy = _parse_energy(d.pop("energy"))

    insight = d.pop("insight")

    bedtime_streak = d.pop("bedtime_streak")

    week = []
    _week = d.pop("week")
    for week_item_data in _week:
      week_item = HealthWeekDay.from_dict(week_item_data)

      week.append(week_item)

    health_summary_response = cls(
      date=date,
      is_today=is_today,
      sleep=sleep,
      move=move,
      energy=energy,
      insight=insight,
      bedtime_streak=bedtime_streak,
      week=week,
    )

    health_summary_response.additional_properties = d
    return health_summary_response

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
