from datetime import date
from uuid import UUID

from sqlalchemy import Date, Float, ForeignKey, Integer, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class HealthKitDailyMetric(RecordModel):
  """One local day of HealthKit totals and averages, as the iOS app computed them.

  The app deduplicates overlapping sources (iPhone and Watch) with HealthKit's
  statistics queries, so these are the day's real values, replaced on each sync.
  """

  __tablename__ = "healthkit_daily_metrics"

  user_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("users.id"), nullable=False, index=True)
  date: Mapped[date] = mapped_column(Date, nullable=False)
  steps: Mapped[int | None] = mapped_column(Integer, nullable=True)
  active_energy_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
  exercise_minutes: Mapped[float | None] = mapped_column(Float, nullable=True)
  resting_heart_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
  hrv_ms: Mapped[float | None] = mapped_column(Float, nullable=True)

  __table_args__ = (UniqueConstraint("user_id", "date", name="healthkit_daily_metrics_user_id_date_key"),)
