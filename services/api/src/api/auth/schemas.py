from api.common.schemas import Schema


class UserInfo(Schema):
  sub: str
  email: str | None = None
  name: str | None = None
  picture: str | None = None
