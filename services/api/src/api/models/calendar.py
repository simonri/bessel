from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint, Uuid
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

  account: Mapped["CalendarAccount"] = relationship(back_populates="calendars", lazy="raise")

  __table_args__ = (UniqueConstraint("account_id", "external_id", name="calendars_account_id_external_id_key"),)
