from pydantic import BaseModel


class UnsubscribeResponse(BaseModel):
  success: bool
  message: str


class UserEmailResponse(BaseModel):
  email: str
