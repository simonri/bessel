from datetime import datetime
from enum import StrEnum
from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, Enum, ForeignKey, Integer, SmallInteger, String, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from api.models.base import RecordModel

if TYPE_CHECKING:
  from api.models.calendar_account import CalendarAccount


class ContactSource(RecordModel):
  """An address book mirrored from a connected Google account."""

  __tablename__ = "contact_sources"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  account_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("calendar_accounts.id", ondelete="CASCADE"), nullable=False, unique=True)
  # Google's token for "changes since"; None until the first full sync, and again after one expires.
  sync_token: Mapped[str | None] = mapped_column(Text, nullable=True)
  synced_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)

  account: Mapped["CalendarAccount"] = relationship(lazy="raise")


class Contact(RecordModel):
  """One person from an address book. `person` is the provider's record as it
  was last fetched; the columns are what Bessel lists and searches by."""

  __tablename__ = "contacts"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  source_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("contact_sources.id", ondelete="CASCADE"), nullable=False)
  # Google's id for the person ("people/c123"), stable across edits.
  resource_name: Mapped[str] = mapped_column(String(255), nullable=False)
  etag: Mapped[str | None] = mapped_column(String(255), nullable=True)
  person: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)

  display_name: Mapped[str] = mapped_column(String(500), nullable=False, default="")
  given_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
  family_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
  nickname: Mapped[str | None] = mapped_column(String(255), nullable=True)
  organization: Mapped[str | None] = mapped_column(String(500), nullable=True)
  job_title: Mapped[str | None] = mapped_column(String(500), nullable=True)
  # Birthdays often come without a year, so the parts are kept apart.
  birthday_month: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
  birthday_day: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
  birthday_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
  photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
  notes: Mapped[str | None] = mapped_column(Text, nullable=True)

  methods: Mapped[list["ContactMethod"]] = relationship(
    back_populates="contact",
    cascade="all, delete-orphan",
    passive_deletes=True,
    lazy="selectin",
    order_by="(ContactMethod.kind, ContactMethod.position)",
  )

  __table_args__ = (UniqueConstraint("source_id", "resource_name", name="contacts_source_id_resource_name_key"),)


class ContactMethodKind(StrEnum):
  phone = "phone"
  email = "email"
  address = "address"
  url = "url"


class ContactMethod(RecordModel):
  """A way to reach a contact: a phone number, email, postal address or link."""

  __tablename__ = "contact_methods"

  contact_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False, index=True)
  kind: Mapped[ContactMethodKind] = mapped_column(Enum(ContactMethodKind, name="contact_method_kind"), nullable=False)
  label: Mapped[str | None] = mapped_column(String(100), nullable=True)
  value: Mapped[str] = mapped_column(Text, nullable=False)
  position: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)

  contact: Mapped[Contact] = relationship(back_populates="methods", lazy="raise")
