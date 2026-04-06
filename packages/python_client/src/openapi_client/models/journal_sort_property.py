from enum import Enum


class JournalSortProperty(str, Enum):
  CREATED_AT = "created_at"
  ENERGY = "energy"
  ENTRY_DATE = "entry_date"
  MOOD = "mood"
  VALUE_1 = "-entry_date"
  VALUE_3 = "-created_at"
  VALUE_5 = "-mood"
  VALUE_7 = "-energy"

  def __str__(self) -> str:
    return str(self.value)
