from pydantic import Field

from api.common.pagination import ListResource
from api.common.schemas import IDSchema, Schema, TimestampedSchema


class BankAccountSchema(IDSchema, TimestampedSchema):
  name: str = Field(description="Display name of the bank account.")
  currency: str = Field(description="ISO 4217 currency code.")
  base_balance: int = Field(description="Starting balance in minor units (cents).")
  subtype: str = Field(description="Account subtype, e.g. 'checking', 'savings'.")
  current_balance: int = Field(default=0, description="Current balance in minor units (base_balance + credits - debits).")


class BankAccountCreate(Schema):
  name: str = Field(description="Display name of the bank account.")
  currency: str = Field(description="ISO 4217 currency code.", max_length=3)
  base_balance: int = Field(default=0, description="Starting balance in minor units (cents).")
  subtype: str = Field(description="Account subtype, e.g. 'checking', 'savings'.")


class BankAccountUpdate(Schema):
  name: str | None = Field(default=None, description="Display name of the bank account.")
  currency: str | None = Field(default=None, description="ISO 4217 currency code.", max_length=3)
  base_balance: int | None = Field(default=None, description="Starting balance in minor units (cents).")
  subtype: str | None = Field(default=None, description="Account subtype, e.g. 'checking', 'savings'.")


class BankAccountListResponse(ListResource[BankAccountSchema]):
  pass
