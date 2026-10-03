from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.models.base import RecordModel

if TYPE_CHECKING:
  from api.models.calendar_account import CalendarAccount


class Calendar(RecordModel):
  __tablename__ = "calendars"

  account_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("calendar_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
  # Google calendar id, or the CalDAV collection URL for iCloud.
  external_id: Mapped[str] = mapped_column(String(1024), nullable=False)
  name: Mapped[str] = mapped_column(String(255), nullable=False)
  color: Mapped[str] = mapped_column(String(7), nullable=False)
  # User preference; seeded from the provider on first sync, never overwritten after.
  hidden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
  # The account may add and change events here (not a subscribed/read-only calendar).
  writable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
  # The account's main calendar; the default target for new events.
  primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))

  # CalDAV ctag as of the last sync; a different one means something changed.
  change_tag: Mapped[str | None] = mapped_column(String(255), nullable=True)
  # Google push channel delivering change notifications for this calendar.
  push_channel_id: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True)
  push_resource_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
  # Secret Google echoes back on every notification, proving it's genuine.
  push_token: Mapped[str | None] = mapped_column(String(64), nullable=True)
  # When the channel needs renewing, or when to retry after Google refused one.
  push_renew_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

  account: Mapped["CalendarAccount"] = relationship(back_populates="calendars", lazy="raise")

  __table_args__ = (UniqueConstraint("account_id", "external_id", name="calendars_account_id_external_id_key"),)
