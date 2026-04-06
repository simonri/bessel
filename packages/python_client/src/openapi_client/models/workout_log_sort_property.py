from enum import Enum


class WorkoutLogSortProperty(str, Enum):
  CREATED_AT = "created_at"
  STARTED_AT = "started_at"
  VALUE_1 = "-created_at"
  VALUE_3 = "-started_at"

  def __str__(self) -> str:
    return str(self.value)
