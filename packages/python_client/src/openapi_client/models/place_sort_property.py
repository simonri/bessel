from enum import StrEnum


class PlaceSortProperty(StrEnum):
  CREATED_AT = "created_at"
  NAME = "name"
  RATING = "rating"
  VALUE_1 = "-created_at"
  VALUE_3 = "-name"
  VALUE_5 = "-rating"
  VALUE_7 = "-visited_at"
  VISITED_AT = "visited_at"

  def __str__(self) -> str:
    return str(self.value)
