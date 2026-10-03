from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import TIMESTAMP, Boolean, Enum, ForeignKey, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.models.base import RecordModel

if TYPE_CHECKING:
  from api.models.calendar import Calendar


class CalendarProvider(StrEnum):
  google = "google"
  icloud = "icloud"


class CalendarAccount(RecordModel):
  """A connected Google or iCloud account whose calendars are mirrored read-only."""

  __tablename__ = "calendar_accounts"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  provider: Mapped[CalendarProvider] = mapped_column(Enum(CalendarProvider, name="calendar_provider"), nullable=False)
  email: Mapped[str] = mapped_column(String(320), nullable=False)
  # Fernet-encrypted: a Google refresh token or an iCloud app-specific password.
  encrypted_credentials: Mapped[str] = mapped_column(Text, nullable=False)
  # Whether the credentials allow changing events (Google: the events scope was granted).
  can_write: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
  # Google: a People scope was granted, so names and photos can be looked up.
  can_read_people: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
  # When names and photos were last fetched (only set when a fetch ran).
  people_synced_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  last_synced_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)

  calendars: Mapped[list["Calendar"]] = relationship(
    back_populates="account",
    cascade="all, delete-orphan",
    passive_deletes=True,
    lazy="raise",
    order_by="Calendar.name",
  )

  __table_args__ = (UniqueConstraint("user_id", "provider", "email", name="calendar_accounts_user_id_provider_email_key"),)
