from api.common.schemas import Schema
from pydantic import UUID4, Field


class KlarnaImportResponse(Schema):
  created: int = Field(description="Pay later purchases imported for the first time.")
  updated: int = Field(description="Purchases imported before whose amount changed, after a return.")
  paid_at_purchase: int = Field(description="Items left out because they were paid at purchase and show in a bank account, card or the Klarna balance.")
  payments: int = Field(description="Payments of pay later purchases imported for the first time, as money into the account.")
  owed: int | None = Field(description="What Klarna says is left to pay, in minor units.")
  drift: int | None = Field(description="What Bessel owes minus what Klarna says is owed; anything but 0 means a purchase or payment is missing.")
  declined: int = Field(description="Card payments Klarna refused; no money moved, so nothing was imported.")
  unrecognized_plans: list[str] = Field(description="Payment plans Bessel doesn't know yet; their purchases were imported as pay later.")


class KlarnaImportRequest(Schema):
  bank_account_id: UUID4
  authorization: str
  cookie: str | None = None
