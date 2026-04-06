from datetime import date

from sqlalchemy import Date, Float, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class WeatherCache(RecordModel):
  __tablename__ = "weather_cache"
  __table_args__ = (UniqueConstraint("date", "lat", "lon"),)

  date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
  lat: Mapped[float] = mapped_column(Float, nullable=False)
  lon: Mapped[float] = mapped_column(Float, nullable=False)
  temperature_max: Mapped[float] = mapped_column(Float, nullable=False)
  temperature_min: Mapped[float] = mapped_column(Float, nullable=False)
  apparent_temperature_max: Mapped[float] = mapped_column(Float, nullable=False)
  precipitation_probability_max: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
  weather_code: Mapped[int] = mapped_column(Integer, nullable=False)
