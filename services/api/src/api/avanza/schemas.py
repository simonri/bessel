from datetime import datetime
from uuid import UUID

from pydantic import Field

from api.common.schemas import Schema


class AvanzaAccountSchema(Schema):
  id: UUID
  name: str
  account_type: str = Field(description="Avanza's account type, e.g. 'INVESTERINGSSPARKONTO'.")
  bank_account_id: UUID | None = Field(description="The Bessel account it imports into; nothing is imported until one is chosen.")
  cash_balance: int | None = Field(description="Cash in the account as Avanza reports it, in minor units.")
  last_synced_at: datetime | None


class AvanzaConnectionSchema(Schema):
  id: UUID
  username: str
  credentials_rejected: bool = Field(description="Avanza rejected the login; syncing stops until new credentials are saved.")
  last_synced_at: datetime | None
  sync_error: str | None
  accounts: list[AvanzaAccountSchema]


class AvanzaStatusResponse(Schema):
  available: bool = Field(description="Whether this user can connect Avanza.")
  connection: AvanzaConnectionSchema | None


class AvanzaConnectRequest(Schema):
  username: str = Field(min_length=1, max_length=255)
  password: str = Field(min_length=1, max_length=255)
  totp_secret: str = Field(min_length=16, max_length=128, description="The secret Avanza shows when adding 'another app' for two-factor login.")


class AvanzaAccountUpdate(Schema):
  bank_account_id: UUID | None = Field(description="The Bessel account to import into, or null to stop importing.")
