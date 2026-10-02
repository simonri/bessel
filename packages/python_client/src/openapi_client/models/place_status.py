from enum import StrEnum


class PlaceStatus(StrEnum):
  VISITED = "visited"
  WANT_TO_GO = "want_to_go"

  def __str__(self) -> str:
    return str(self.value)
