from uuid import UUID

from sqlalchemy import Select, func, select

from api.common.repository.base import RepositoryBase, RepositoryIDMixin
from api.models.exercise import Exercise
from api.models.workout_log import WorkoutLog
from api.models.workout_set import WorkoutSet


class ExerciseRepository(RepositoryBase[Exercise], RepositoryIDMixin[Exercise, UUID]):
  model = Exercise

  async def search(self, query: str | None, category: str | None, limit: int = 50) -> list[Exercise]:
    statement = self.get_base_statement()

    if query:
      statement = statement.where(Exercise.name.ilike(f"%{query}%"))
    if category:
      statement = statement.where(Exercise.category == category)

    statement = statement.order_by(Exercise.name.asc()).limit(limit)
    result = await self.session.execute(statement)
    return list(result.scalars().all())


class WorkoutLogRepository(RepositoryBase[WorkoutLog], RepositoryIDMixin[WorkoutLog, UUID]):
  model = WorkoutLog


class WorkoutSetRepository(RepositoryBase[WorkoutSet], RepositoryIDMixin[WorkoutSet, UUID]):
  model = WorkoutSet

  def get_sets_for_workout(self, workout_log_id: UUID) -> Select[tuple[WorkoutSet]]:
    return self.get_base_statement().where(WorkoutSet.workout_log_id == workout_log_id).order_by(WorkoutSet.exercise_id, WorkoutSet.set_number)

  async def get_best_sets_for_exercise(self, exercise_id: UUID) -> list[WorkoutSet]:
    """Get the best (heaviest) set for each rep count for an exercise."""
    subq = (
      select(
        WorkoutSet.reps,
        func.max(WorkoutSet.weight).label("max_weight"),
      )
      .where(WorkoutSet.exercise_id == exercise_id)
      .group_by(WorkoutSet.reps)
      .subquery()
    )

    statement = (
      select(WorkoutSet)
      .join(
        subq,
        (WorkoutSet.reps == subq.c.reps) & (WorkoutSet.weight == subq.c.max_weight),
      )
      .where(WorkoutSet.exercise_id == exercise_id)
      .order_by(WorkoutSet.reps.asc())
    )

    result = await self.session.execute(statement)
    return list(result.scalars().unique().all())

  async def get_max_weight_for_exercise_reps(self, exercise_id: UUID, reps: int) -> float | None:
    """Get the current PR weight for a given exercise and rep count."""
    statement = select(func.max(WorkoutSet.weight)).where(WorkoutSet.exercise_id == exercise_id, WorkoutSet.reps == reps)
    result = await self.session.execute(statement)
    return result.scalar_one_or_none()

  async def get_recent_exercises(self, limit: int = 10) -> list[UUID]:
    """Get IDs of recently used exercises."""
    statement = select(WorkoutSet.exercise_id).order_by(WorkoutSet.created_at.desc()).distinct().limit(limit)
    result = await self.session.execute(statement)
    return list(result.scalars().all())

  async def get_last_session_sets(self, exercise_id: UUID) -> list[WorkoutSet]:
    """Get sets from the most recent workout that included this exercise."""
    latest_workout_id_subq = (
      select(WorkoutSet.workout_log_id)
      .where(WorkoutSet.exercise_id == exercise_id)
      .order_by(WorkoutSet.created_at.desc())
      .limit(1)
      .scalar_subquery()
    )

    statement = (
      select(WorkoutSet)
      .where(
        WorkoutSet.exercise_id == exercise_id,
        WorkoutSet.workout_log_id == latest_workout_id_subq,
      )
      .order_by(WorkoutSet.set_number)
    )

    result = await self.session.execute(statement)
    return list(result.scalars().all())
