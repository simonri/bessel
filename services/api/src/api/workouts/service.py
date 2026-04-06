from api.common.db.postgres import AsyncSession
from api.models.workout_set import WorkoutSet
from api.workouts.repository import WorkoutSetRepository


class WorkoutService:
  async def check_and_flag_pr(
    self,
    session: AsyncSession,
    workout_set: WorkoutSet,
  ) -> bool:
    """Check if a set is a PR and flag it accordingly. Returns True if PR."""
    repo = WorkoutSetRepository.from_session(session)
    current_max = await repo.get_max_weight_for_exercise_reps(
      exercise_id=workout_set.exercise_id,
      reps=workout_set.reps,
    )

    if current_max is None or workout_set.weight > current_max:
      workout_set.is_pr = True
      return True

    return False


workout_service = WorkoutService()
