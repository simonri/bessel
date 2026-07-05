from enum import Enum


class RecipeType(str, Enum):
  DESSERT = "dessert"
  MAIN = "main"
  OTHER = "other"

  def __str__(self) -> str:
    return str(self.value)
