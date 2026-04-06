from enum import Enum


class Equipment(str, Enum):
  BAND = "band"
  BARBELL = "barbell"
  BODYWEIGHT = "bodyweight"
  CABLE = "cable"
  DUMBBELL = "dumbbell"
  KETTLEBELL = "kettlebell"
  MACHINE = "machine"
  OTHER = "other"

  def __str__(self) -> str:
    return str(self.value)
