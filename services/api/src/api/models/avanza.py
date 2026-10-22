from datetime import date, datetime
from uuid import UUID

from sqlalchemy import TIMESTAMP, BigInteger, Date, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.models.base import RecordModel


class AvanzaConnection(RecordModel):
  """The user's Avanza login, used to read accounts, positions and transactions."""

  __tablename__ = "avanza_connections"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, unique=True)
  username: Mapped[str] = mapped_column(String(255), nullable=False)
  # Fernet-encrypted JSON with the password and TOTP secret. They can place
  # trades, so they never leave the server and only read routes are called.
  encrypted_credentials: Mapped[str] = mapped_column(Text, nullable=False)
  # Set when Avanza rejects the login; syncs stop until the user saves new
  # credentials, so a bad password isn't retried into a lockout.
  credentials_rejected_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  last_synced_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
  # Set when the user was told syncing stopped; cleared by the next sync that works.
  stale_notified_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

  accounts: Mapped[list["AvanzaAccount"]] = relationship(
    back_populates="connection",
    cascade="all, delete-orphan",
    passive_deletes=True,
    lazy="raise",
    order_by="AvanzaAccount.created_at",
  )


class AvanzaAccount(RecordModel):
  """One Avanza account (ISK, KF, AF...) and the Bessel account it imports into."""

  __tablename__ = "avanza_accounts"

  connection_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("avanza_connections.id", ondelete="CASCADE"), nullable=False, index=True)
  external_id: Mapped[str] = mapped_column(String(64), nullable=False)
  name: Mapped[str] = mapped_column(String(255), nullable=False)
  account_type: Mapped[str] = mapped_column(String(64), nullable=False)
  bank_account_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("bank_accounts.id", ondelete="SET NULL"), nullable=True, unique=True)
  # Cash in the account as Avanza reports it, to check the imported history adds up.
  cash_balance: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
  last_synced_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)

  connection: Mapped[AvanzaConnection] = relationship(back_populates="accounts", lazy="raise")

  __table_args__ = (UniqueConstraint("connection_id", "external_id"),)


class HoldingSnapshot(RecordModel):
  """A position as the broker reported it on one day: the source of holdings for synced accounts."""

  __tablename__ = "holding_snapshots"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  bank_account_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("bank_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
  security_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("securities.id", ondelete="CASCADE"), nullable=False)
  snapshot_date: Mapped[date] = mapped_column(Date, nullable=False)
  quantity: Mapped[int] = mapped_column(BigInteger, nullable=False)  # micro-units (x1,000,000)
  # Minor units of `currency`, the account's currency (Avanza values positions in it).
  value: Mapped[int] = mapped_column(BigInteger, nullable=False)
  acquired_value: Mapped[int] = mapped_column(BigInteger, nullable=False)
  currency: Mapped[str] = mapped_column(String(3), nullable=False)

  __table_args__ = (UniqueConstraint("bank_account_id", "security_id", "snapshot_date"),)
