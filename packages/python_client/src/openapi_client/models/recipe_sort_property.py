from enum import Enum


class RecipeSortProperty(str, Enum):
  CREATED_AT = "created_at"
  MODIFIED_AT = "modified_at"
  TITLE = "title"
  VALUE_1 = "-created_at"
  VALUE_3 = "-title"
  VALUE_5 = "-modified_at"

  def __str__(self) -> str:
    return str(self.value)
