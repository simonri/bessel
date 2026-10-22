from enum import StrEnum


class RuleScope(StrEnum):
  ANY = "any"
  COMPANY = "company"
  PRIVATE = "private"

  def __str__(self) -> str:
    return str(self.value)
