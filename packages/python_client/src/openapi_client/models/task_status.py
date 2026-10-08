from enum import StrEnum


class TaskStatus(StrEnum):
  CANCELLED = "cancelled"
  DONE = "done"
  IN_PROGRESS = "in_progress"
  IN_REVIEW = "in_review"
  TODO = "todo"

  def __str__(self) -> str:
    return str(self.value)
