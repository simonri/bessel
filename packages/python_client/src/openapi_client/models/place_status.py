from enum import Enum


class PlaceStatus(str, Enum):
  VISITED = "visited"
  WANT_TO_GO = "want_to_go"

  def __str__(self) -> str:
    return str(self.value)
