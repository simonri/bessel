from enum import Enum


class JournalSortProperty(str, Enum):
  CREATED_AT = "created_at"
  ENTRY_DATE = "entry_date"
  VALUE_1 = "-entry_date"
  VALUE_3 = "-created_at"

  def __str__(self) -> str:
    return str(self.value)
