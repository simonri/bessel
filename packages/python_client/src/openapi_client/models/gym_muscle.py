from enum import StrEnum


class GymMuscle(StrEnum):
  BACK = "back"
  BICEPS = "biceps"
  CALVES = "calves"
  CHEST = "chest"
  CORE = "core"
  FOREARMS = "forearms"
  GLUTES = "glutes"
  HAMSTRINGS = "hamstrings"
  QUADS = "quads"
  SHOULDERS = "shoulders"
  TRICEPS = "triceps"

  def __str__(self) -> str:
    return str(self.value)
