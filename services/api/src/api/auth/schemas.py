from api.common.schemas import Schema


class UserInfo(Schema):
  sub: str
  email: str | None = None
  name: str | None = None
  picture: str | None = None
  roles: list[str] = []


class TokenPayload(Schema):
  sub: str
  iss: str
  aud: str | list[str]
  exp: int
  iat: int
  email: str | None = None
  name: str | None = None
  picture: str | None = None
