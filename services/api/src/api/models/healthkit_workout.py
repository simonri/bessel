from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import TIMESTAMP, Float, ForeignKey, Index, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from api.models.base import RecordModel


class HealthKitWorkout(RecordModel):
  """Mirror of Apple HealthKit's HKWorkout sample, synced from the iOS app."""

  __tablename__ = "healthkit_workouts"

  # Nullable like every other user-owned table: pre-auth/seeded rows land with
  # user_id NULL and are claimed by the first user ever created (see
  # UserRepository.claim_orphaned_data).
  user_id: Mapped[UUID | None] = mapped_column(Uuid, ForeignKey("users.id"), nullable=True, index=True)
  healthkit_uuid: Mapped[UUID] = mapped_column(Uuid, nullable=False)
  workout_activity_type: Mapped[int] = mapped_column(Integer, nullable=False)
  workout_activity_type_name: Mapped[str] = mapped_column(String(64), nullable=False)
  start_date: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  end_date: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=True), nullable=False)
  duration: Mapped[float] = mapped_column(Float, nullable=False)
  total_energy_burned: Mapped[float | None] = mapped_column(Float, nullable=True)
  total_distance: Mapped[float | None] = mapped_column(Float, nullable=True)
  source_name: Mapped[str] = mapped_column(String(255), nullable=False)
  source_bundle_id: Mapped[str] = mapped_column(String(255), nullable=False)
  source_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
  device_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
  workout_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
  statistics: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

  __table_args__ = (
    UniqueConstraint("user_id", "healthkit_uuid", name="healthkit_workouts_user_id_healthkit_uuid_key"),
    Index("ix_healthkit_workouts_user_id_start_date", "user_id", "start_date"),
  )
