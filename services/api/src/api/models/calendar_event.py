from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, Boolean, CheckConstraint, Date, ForeignKey, Index, String, Text, UniqueConstraint, Uuid, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class CalendarEvent(RecordModel):
  """One occurrence of a provider event; recurring events are stored expanded."""

  __tablename__ = "calendar_events"

  calendar_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("calendars.id", ondelete="CASCADE"), nullable=False)
  # Stable per occurrence: Google's instance id, or UID + RECURRENCE-ID for iCloud.
  external_id: Mapped[str] = mapped_column(String(1024), nullable=False)
  title: Mapped[str] = mapped_column(String(1024), nullable=False)
  location: Mapped[str | None] = mapped_column(String(1024), nullable=True)
  all_day: Mapped[bool] = mapped_column(Boolean, nullable=False)
  # Timed events use start_at/end_at; all-day events use start_date/end_date (end exclusive).
  start_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  end_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True)
  start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
  end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
  description: Mapped[str | None] = mapped_column(Text, nullable=True)
  creator_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
  creator_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
  # [{"email", "name", "response"}]; response is accepted/declined/tentative/needs_action.
  attendees: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb"))
  # The account's own reply when it's a guest (same values); null otherwise.
  my_response: Mapped[str | None] = mapped_column(String(16), nullable=True)
  conference_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
  # Link to the event in the provider's own UI (Google only).
  html_link: Mapped[str | None] = mapped_column(String(2048), nullable=True)
  busy: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
  recurring: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
  # public/private/confidential; null means the calendar's default.
  visibility: Mapped[str | None] = mapped_column(String(32), nullable=True)
  # False for invitations the account doesn't organize and provider-managed events.
  editable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
  # Google: the parent event id; iCloud: the series UID. Null for single events.
  series_id: Mapped[str | None] = mapped_column(String(1024), nullable=True)
  # The occurrence's slot in its series as the provider wrote it (ISO date or
  # datetime); stays put when the occurrence itself is moved.
  original_start: Mapped[str | None] = mapped_column(String(64), nullable=True)
  # Provider version tag for optimistic concurrency (If-Match).
  etag: Mapped[str | None] = mapped_column(String(255), nullable=True)
  # The series' RRULE value (no "RRULE:" prefix), copied onto each occurrence.
  rrule: Mapped[str | None] = mapped_column(String(1024), nullable=True)
  # iCloud: URL of the .ics resource holding the event and its series.
  resource_href: Mapped[str | None] = mapped_column(String(2048), nullable=True)

  __table_args__ = (
    UniqueConstraint("calendar_id", "external_id", name="calendar_events_calendar_id_external_id_key"),
    CheckConstraint(
      "(all_day AND start_date IS NOT NULL AND end_date IS NOT NULL) OR (NOT all_day AND start_at IS NOT NULL AND end_at IS NOT NULL)",
      name="span",
    ),
    Index("ix_calendar_events_calendar_id_start_at", "calendar_id", "start_at"),
    Index("ix_calendar_events_calendar_id_start_date", "calendar_id", "start_date"),
  )
