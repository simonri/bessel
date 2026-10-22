from datetime import date, datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, Boolean, Date, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.models.base import RecordModel


class BankConnection(RecordModel):
  """A bank the user approved Bessel to read through Enable Banking, until the approval runs out."""

  __tablename__ = "bank_connections"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  bank_name: Mapped[str] = mapped_column(String(255), nullable=False)
  bank_country: Mapped[str] = mapped_column(String(2), nullable=False)
  # Fernet-encrypted Enable Banking session id.
  encrypted_session_id: Mapped[str] = mapped_column(Text, nullable=False)
  # When the bank approval ends; reading stops then until the user approves again.
  valid_until: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  expiry_notified_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  last_synced_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
  # Set when the user was told syncing stopped; cleared by the next sync that works.
  stale_notified_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

  accounts: Mapped[list["BankConnectionAccount"]] = relationship(
    back_populates="connection",
    cascade="all, delete-orphan",
    passive_deletes=True,
    lazy="raise",
    order_by="BankConnectionAccount.created_at",
  )

  __table_args__ = (UniqueConstraint("user_id", "bank_name", "bank_country"),)


class BankConnectionAccount(RecordModel):
  """One of the bank's accounts, and the Bessel bank account its transactions go into."""

  __tablename__ = "bank_connection_accounts"

  connection_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("bank_connections.id", ondelete="CASCADE"), nullable=False, index=True)
  # Stays the same when the user approves again; the uid changes with every session.
  identification_hash: Mapped[str] = mapped_column(String(255), nullable=False)
  uid: Mapped[str] = mapped_column(String(255), nullable=False)
  name: Mapped[str | None] = mapped_column(String(255), nullable=True)
  iban: Mapped[str | None] = mapped_column(String(64), nullable=True)
  currency: Mapped[str] = mapped_column(String(3), nullable=False)
  bank_account_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, index=True)
  # The first day imported: the day of the newest transaction already in the
  # Bessel account when it was linked, so hand-imported history isn't repeated.
  import_from: Mapped[date | None] = mapped_column(Date, nullable=True)
  # When this account last imported; until then the import reaches back to `import_from`.
  last_synced_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  # False when the latest approval didn't include the account, so it can't be read.
  shared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
  # The bank's balance at the last sync, in minor units.
  bank_balance: Mapped[int | None] = mapped_column(Integer, nullable=True)
  # When the Bessel account's starting balance was set from the bank's. After that
  # it stays put, so a missed or doubled transaction shows up as drift.
  balance_anchored_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  # The bank's balance minus Bessel's at the last sync; anything but 0 means they disagree.
  balance_drift: Mapped[int | None] = mapped_column(Integer, nullable=True)
  drift_notified_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

  connection: Mapped[BankConnection] = relationship(back_populates="accounts", lazy="raise")

  __table_args__ = (UniqueConstraint("connection_id", "identification_hash"),)
