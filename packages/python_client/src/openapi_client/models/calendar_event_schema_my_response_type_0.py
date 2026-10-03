from enum import StrEnum


class CalendarEventSchemaMyResponseType0(StrEnum):
  ACCEPTED = "accepted"
  DECLINED = "declined"
  NEEDS_ACTION = "needs_action"
  TENTATIVE = "tentative"

  def __str__(self) -> str:
    return str(self.value)
