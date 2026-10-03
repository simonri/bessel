from enum import StrEnum


class EditScope(StrEnum):
  ALL = "all"
  FOLLOWING = "following"
  THIS = "this"

  def __str__(self) -> str:
    return str(self.value)
