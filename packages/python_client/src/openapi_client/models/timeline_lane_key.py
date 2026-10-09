from enum import StrEnum


class TimelineLaneKey(StrEnum):
  PC = "pc"
  SLEEP = "sleep"
  WORKOUTS = "workouts"

  def __str__(self) -> str:
    return str(self.value)
