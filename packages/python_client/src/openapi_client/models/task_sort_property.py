from enum import Enum


class TaskSortProperty(str, Enum):
  COMPLETED_AT = "completed_at"
  CREATED_AT = "created_at"
  DUE_DATE = "due_date"
  POSITION = "position"
  PRIORITY = "priority"
  TITLE = "title"
  VALUE_1 = "-created_at"
  VALUE_11 = "-position"
  VALUE_3 = "-due_date"
  VALUE_5 = "-priority"
  VALUE_7 = "-title"
  VALUE_9 = "-completed_at"

  def __str__(self) -> str:
    return str(self.value)
