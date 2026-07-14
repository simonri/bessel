from api.common.schemas import Schema
from pydantic import UUID4


class KlarnaImportRequest(Schema):
  bank_account_id: UUID4
  authorization: str
  cookie: str | None = None
