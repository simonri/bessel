from datetime import date, datetime
from typing import Any, Literal
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
  credentials_rejected: bool = Field(description="Avanza rejected the desktop app's login; the user needs to sign in again there.")
  last_synced_at: datetime | None
  sync_error: str | None
  accounts: list[AvanzaAccountSchema]
  sync_from: date | None = Field(description="The first day the next import's transactions must cover; null when no account is linked.")


class AvanzaStatusResponse(Schema):
  available: bool = Field(description="Whether this user can connect Avanza.")
  connection: AvanzaConnectionSchema | None


class AvanzaImportRequest(Schema):
  username: str = Field(min_length=1, max_length=255, description="The Avanza username the desktop app signed in with.")
  overview: dict[str, Any] = Field(description="Avanza's raw categorizedAccounts response.")
  positions: dict[str, Any] | None = Field(description="Avanza's raw positions response; null when no account is linked.")
  transactions: list[dict[str, Any]] = Field(max_length=500, description="Avanza's raw transaction list responses; pages may overlap.")
  fetched_from: date | None = Field(description="The first day the transaction responses cover; null when none were fetched.")


class AvanzaSyncFailure(Schema):
  reason: Literal["rejected", "unreachable"] = Field(description="Avanza rejected the login, or couldn't be reached.")


class AvanzaAccountUpdate(Schema):
  bank_account_id: UUID | None = Field(description="The Bessel account to import into, or null to stop importing.")
