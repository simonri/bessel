from datetime import date

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema
from api.models.transaction import TransactionDirection
from pydantic import UUID4, Field


class TransactionSchema(IDSchema, TimestampedSchema):
  amount: int = Field(description="Amount in minor units (cents).")
  currency: str
  transaction_date: date
  direction: TransactionDirection
  description: str | None
  category: str | None
  transaction_type: str | None
  dedup_hash: str
  bank_account_id: UUID4
  raw_id: UUID4 | None


class TransactionListResponse(ListResource[TransactionSchema]):
  pass


class ImportResponse(Schema):
  created: int = Field(description="Number of new transactions imported.")
  skipped: int = Field(description="Number of duplicate transactions skipped.")


class BulkDeleteRequest(Schema):
  ids: list[UUID4] = Field(description="List of transaction IDs to delete.")
