from enum import StrEnum


class RecipeType(StrEnum):
  DESSERT = "dessert"
  MAIN = "main"
  OTHER = "other"

  def __str__(self) -> str:
    return str(self.value)
