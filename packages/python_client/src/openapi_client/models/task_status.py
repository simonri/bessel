from enum import Enum


class TaskStatus(str, Enum):
  CANCELLED = "cancelled"
  DONE = "done"
  IN_PROGRESS = "in_progress"
  TODO = "todo"

  def __str__(self) -> str:
    return str(self.value)
