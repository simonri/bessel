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
  category_id: UUID4 | None
  transaction_type: str | None
  dedup_hash: str
  bank_account_id: UUID4
  raw_id: UUID4 | None


class TransactionUpdate(Schema):
  category_id: UUID4 | None = Field(default=None, description="Category ID to assign.")


class TransactionUpdateResponse(TransactionSchema):
  same_description_count: int = Field(default=0, description="Number of other transactions with the same description not yet assigned this category.")


class TransactionListResponse(ListResource[TransactionSchema]):
  pass


class ImportResponse(Schema):
  created: int = Field(description="Number of new transactions imported.")
  skipped: int = Field(description="Number of duplicate transactions skipped.")


class BulkDeleteRequest(Schema):
  ids: list[UUID4] = Field(description="List of transaction IDs to delete.")


class BulkCategorizeRequest(Schema):
  description: str = Field(description="Exact description to match.")
  category_id: UUID4 | None = Field(description="Category ID to assign.")


class BulkCategorizeResponse(Schema):
  updated: int = Field(description="Number of transactions updated.")
