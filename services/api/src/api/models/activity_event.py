from sqlalchemy import BigInteger, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class ActivityEvent(RecordModel):
    __tablename__ = "activity_events"

    ts: Mapped[int] = mapped_column(BigInteger, nullable=False)
    state: Mapped[str] = mapped_column(String(10), nullable=False)
    app_class: Mapped[str | None] = mapped_column(String(255), nullable=True)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    workspace: Mapped[str | None] = mapped_column(String(100), nullable=True)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    local_id: Mapped[int] = mapped_column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("source", "local_id", name="activity_events_source_local_id_key"),
        Index("ix_activity_events_source_ts", "source", "ts"),
    )
