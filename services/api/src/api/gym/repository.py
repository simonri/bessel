from collections.abc import Sequence
from datetime import date
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.common.utils import utc_now
from api.models.gym import GymExercise, GymTopSet

RECENT_SETS = 10


class GymExerciseRepository(RepositoryBase[GymExercise], RepositoryIDMixin[GymExercise, UUID]):
  model = GymExercise

  async def list_for_user(self, user_id: UUID) -> Sequence[GymExercise]:
    return await self.get_all(self.get_base_statement().where(GymExercise.user_id == user_id, GymExercise.deleted_at.is_(None)))

  async def get_by_name(self, user_id: UUID, name: str) -> GymExercise | None:
    statement = self.get_base_statement().where(
      GymExercise.user_id == user_id,
      GymExercise.deleted_at.is_(None),
      func.lower(GymExercise.name) == name.lower(),
    )
    return await self.get_one_or_none(statement)


class GymTopSetRepository(RepositoryBase[GymTopSet], RepositoryIDMixin[GymTopSet, UUID]):
  model = GymTopSet

  async def upsert(self, exercise: GymExercise, performed_on: date, weight_kg: float) -> GymTopSet:
    """Sets the exercise's top set for the day, replacing one already there."""
    row: dict[str, Any] = {"user_id": exercise.user_id, "exercise_id": exercise.id, "performed_on": performed_on, "weight_kg": weight_kg}
    statement = (
      pg_insert(GymTopSet)
      .values(row)
      .on_conflict_do_update(
        constraint="gym_top_sets_exercise_id_performed_on_key",
        set_={"weight_kg": weight_kg, "modified_at": utc_now()},
      )
      .returning(GymTopSet)
      .execution_options(populate_existing=True)
    )
    return (await self.session.execute(statement)).scalar_one()

  async def get_for_day(self, exercise: GymExercise, performed_on: date) -> GymTopSet | None:
    statement = self.get_base_statement().where(GymTopSet.exercise_id == exercise.id, GymTopSet.performed_on == performed_on)
    return await self.get_one_or_none(statement)

  async def list_for_exercise(self, exercise: GymExercise) -> Sequence[GymTopSet]:
    statement = self.get_base_statement().where(GymTopSet.exercise_id == exercise.id).order_by(GymTopSet.performed_on)
    return await self.get_all(statement)

  async def list_recent_by_exercise(self, user_id: UUID) -> Sequence[GymTopSet]:
    """The last few top sets of each of the user's exercises."""
    ranked = (
      select(
        GymTopSet.id,
        func.row_number().over(partition_by=GymTopSet.exercise_id, order_by=GymTopSet.performed_on.desc()).label("rank"),
      )
      .where(GymTopSet.user_id == user_id)
      .subquery()
    )
    statement = (
      self.get_base_statement()
      .join(ranked, ranked.c.id == GymTopSet.id)
      .where(ranked.c.rank <= RECENT_SETS)
      .order_by(GymTopSet.exercise_id, GymTopSet.performed_on)
    )
    return await self.get_all(statement)

  async def list_best_by_exercise(self, user_id: UUID) -> Sequence[GymTopSet]:
    """The heaviest top set of each of the user's exercises, the latest if tied."""
    statement = (
      self.get_base_statement()
      .where(GymTopSet.user_id == user_id)
      .distinct(GymTopSet.exercise_id)
      .order_by(GymTopSet.exercise_id, GymTopSet.weight_kg.desc(), GymTopSet.performed_on.desc())
    )
    return await self.get_all(statement)
