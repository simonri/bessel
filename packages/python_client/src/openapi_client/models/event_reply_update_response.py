from enum import StrEnum


class EventReplyUpdateResponse(StrEnum):
  ACCEPTED = "accepted"
  DECLINED = "declined"
  TENTATIVE = "tentative"

  def __str__(self) -> str:
    return str(self.value)
