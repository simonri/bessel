from enum import StrEnum


class CalendarEventAttendeeResponse(StrEnum):
  ACCEPTED = "accepted"
  DECLINED = "declined"
  NEEDS_ACTION = "needs_action"
  TENTATIVE = "tentative"

  def __str__(self) -> str:
    return str(self.value)
