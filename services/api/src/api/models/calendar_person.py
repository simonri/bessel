from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class CalendarPerson(RecordModel):
  """The name and photo a Google account has for someone on its events,
  from the account's contacts or company directory."""

  __tablename__ = "calendar_people"

  account_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("calendar_accounts.id", ondelete="CASCADE"), nullable=False, index=True)
  # Lowercased.
  email: Mapped[str] = mapped_column(String(320), nullable=False)
  name: Mapped[str | None] = mapped_column(String(255), nullable=True)
  photo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)

  __table_args__ = (UniqueConstraint("account_id", "email", name="calendar_people_account_id_email_key"),)
