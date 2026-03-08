from datetime import date

from sqlalchemy import Date, Float, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class Place(RecordModel):
  __tablename__ = "places"

  name: Mapped[str] = mapped_column(String(255), nullable=False)
  address: Mapped[str | None] = mapped_column(String(500), nullable=True)
  country: Mapped[str | None] = mapped_column(String(100), nullable=True)
  latitude: Mapped[float] = mapped_column(Float, nullable=False)
  longitude: Mapped[float] = mapped_column(Float, nullable=False)
  google_place_id: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
  plus_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
  status: Mapped[str] = mapped_column(String(20), nullable=False, default="want_to_go")
  rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
  visited_at: Mapped[date | None] = mapped_column(Date, nullable=True)
  review: Mapped[str | None] = mapped_column(Text, nullable=True)
  category: Mapped[str | None] = mapped_column(String(100), nullable=True)
  tags: Mapped[list[str] | None] = mapped_column(ARRAY(String(50)), nullable=True)
  photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
  website: Mapped[str | None] = mapped_column(String(500), nullable=True)
  phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
