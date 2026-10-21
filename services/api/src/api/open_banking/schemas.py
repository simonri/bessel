from datetime import date, datetime
from uuid import UUID

from pydantic import Field

from api.common.schemas import Schema


class BankConnectionAccountSchema(Schema):
  id: UUID
  name: str | None
  iban: str | None
  currency: str
  bank_account_id: UUID | None = Field(description="The Bessel account its transactions go into; nothing is imported until one is chosen.")
  import_from: date | None = Field(description="The first day imported, so transactions imported by hand aren't repeated.")
  shared: bool = Field(description="False when the latest bank approval didn't include this account.")
  bank_balance: int | None = Field(description="The bank's balance at the last sync, in minor units.")
  balance_drift: int | None = Field(
    description="The bank's balance minus Bessel's at the last sync; anything but 0 means a transaction is missing, doubled or still pending."
  )


class BankConnectionSchema(Schema):
  id: UUID
  bank_name: str
  valid_until: datetime = Field(description="When the bank approval ends; renew it before then.")
  last_synced_at: datetime | None
  sync_error: str | None
  accounts: list[BankConnectionAccountSchema]


class BankConnectionListResponse(Schema):
  available: bool = Field(description="Whether this user can connect a bank.")
  banks: list[str] = Field(description="The banks this user can connect.")
  connections: list[BankConnectionSchema]


class BankAuthorizeRequest(Schema):
  bank_name: str = Field(description="The bank to connect, one of `banks`.")


class BankAuthorizeResponse(Schema):
  url: str = Field(description="Where to send the user to approve access with the bank.")


class BankCallbackRequest(Schema):
  code: str
  state: str


class BankConnectionAccountUpdate(Schema):
  bank_account_id: UUID | None = Field(description="The Bessel account to import into, or null to stop importing.")
