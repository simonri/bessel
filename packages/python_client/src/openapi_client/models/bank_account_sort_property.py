from enum import StrEnum


class BankAccountSortProperty(StrEnum):
  CREATED_AT = "created_at"
  NAME = "name"
  VALUE_1 = "-created_at"
  VALUE_3 = "-name"

  def __str__(self) -> str:
    return str(self.value)
