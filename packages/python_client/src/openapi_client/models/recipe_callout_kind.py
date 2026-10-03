from enum import StrEnum


class RecipeCalloutKind(StrEnum):
  TIP = "tip"
  WARNING = "warning"

  def __str__(self) -> str:
    return str(self.value)
