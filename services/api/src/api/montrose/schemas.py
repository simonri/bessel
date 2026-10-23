from datetime import datetime
from uuid import UUID

from pydantic import Field

from api.common.schemas import Schema


class MontroseAccountSchema(Schema):
  id: UUID
  account_number: str
  name: str
  account_type: str = Field(description="Montrose's account type, e.g. 'ISK', 'KF' or 'DEPCR'.")
  bank_account_id: UUID | None = Field(description="The Bessel account it imports into; nothing is imported until one is chosen.")
  last_synced_at: datetime | None


class MontroseConnectionSchema(Schema):
  id: UUID
  rejected: bool = Field(description="Montrose no longer accepts the consent; syncing waits for a new BankID login.")
  consent_expires_at: datetime = Field(description="When the BankID consent runs out and has to be given again.")
  last_synced_at: datetime | None
  sync_error: str | None
  accounts: list[MontroseAccountSchema]


class MontroseStatusResponse(Schema):
  connection: MontroseConnectionSchema | None


class MontroseAuthorizeResponse(Schema):
  url: str = Field(description="Montrose's BankID login, which sends the user back to Bessel's callback page.")


class MontroseCallbackRequest(Schema):
  code: str = Field(min_length=1, max_length=2048)
  state: str = Field(min_length=1, max_length=8192)
  iss: str | None = Field(default=None, max_length=255, description="The issuer Montrose names on the redirect, checked against its own.")


class MontroseAccountUpdate(Schema):
  bank_account_id: UUID | None = Field(description="The Bessel account to import into, or null to stop importing.")
