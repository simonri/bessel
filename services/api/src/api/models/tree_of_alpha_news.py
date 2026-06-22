from datetime import datetime

from sqlalchemy import TIMESTAMP, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class TreeOfAlphaNews(RecordModel):
  __tablename__ = "tree_of_alpha_news"
  __table_args__ = (UniqueConstraint("external_id"),)

  external_id: Mapped[str] = mapped_column(String(255), nullable=False)
  title: Mapped[str] = mapped_column(Text, nullable=False)
  url: Mapped[str | None] = mapped_column(Text, nullable=True)
  source: Mapped[str | None] = mapped_column(String(100), nullable=True)
  likes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  published_at: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  notification_sent_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True), nullable=True, default=None)
