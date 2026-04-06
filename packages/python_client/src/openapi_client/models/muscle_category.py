from enum import Enum


class MuscleCategory(str, Enum):
  BACK = "back"
  BICEPS = "biceps"
  CALVES = "calves"
  CARDIO = "cardio"
  CHEST = "chest"
  CORE = "core"
  FOREARMS = "forearms"
  GLUTES = "glutes"
  HAMSTRINGS = "hamstrings"
  OLYMPIC = "olympic"
  OTHER = "other"
  QUADS = "quads"
  SHOULDERS = "shoulders"
  TRICEPS = "triceps"

  def __str__(self) -> str:
    return str(self.value)
