from datetime import datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, BigInteger, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.models.base import RecordModel


class MontroseConnection(RecordModel):
  """The user's consent, given with BankID, for Bessel to read their Montrose accounts through Montrose's MCP service."""

  __tablename__ = "montrose_connections"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, unique=True)
  # Fernet-encrypted JSON: the OAuth client Bessel registered, and the current access and refresh tokens.
  encrypted_client: Mapped[str] = mapped_column(Text, nullable=False)
  encrypted_tokens: Mapped[str] = mapped_column(Text, nullable=False)
  access_expires_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  # The refresh token rolls for at most 90 days from the BankID consent; then the user logs in again.
  consented_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  # Set when Montrose stops accepting the consent; syncing waits for a new BankID login.
  rejected_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  last_synced_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)

  accounts: Mapped[list["MontroseAccount"]] = relationship(
    back_populates="connection",
    cascade="all, delete-orphan",
    passive_deletes=True,
    lazy="raise",
    order_by="MontroseAccount.created_at",
  )


class MontroseAccount(RecordModel):
  """One Montrose account (ISK, KF, depå...) and the Bessel account it imports into."""

  __tablename__ = "montrose_accounts"

  connection_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("montrose_connections.id", ondelete="CASCADE"), nullable=False, index=True)
  external_id: Mapped[str] = mapped_column(String(64), nullable=False)
  account_number: Mapped[str] = mapped_column(String(64), nullable=False)
  name: Mapped[str] = mapped_column(String(255), nullable=False)
  account_type: Mapped[str] = mapped_column(String(32), nullable=False)
  bank_account_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, unique=True)
  # Cash in the account as Montrose reports it, to check the imported history adds up.
  cash_balance: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
  # Montrose's cash minus Bessel's balance at the last sync; anything but 0 means a movement is missing.
  balance_drift: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
  # The Bessel account holding what was imported, which moves along when the account is linked elsewhere.
  imported_into_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True)
  last_synced_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

  connection: Mapped[MontroseConnection] = relationship(back_populates="accounts", lazy="raise")

  __table_args__ = (UniqueConstraint("connection_id", "external_id"),)
