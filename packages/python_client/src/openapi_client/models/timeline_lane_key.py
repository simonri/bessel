from enum import StrEnum


class TimelineLaneKey(StrEnum):
  PC = "pc"
  SLEEP = "sleep"

  def __str__(self) -> str:
    return str(self.value)
