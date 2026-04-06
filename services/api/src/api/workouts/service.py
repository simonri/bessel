from api.common.db.postgres import AsyncSession
from api.models.workout_set import WorkoutSet
from api.workouts.repository import WorkoutSetRepository


def calculate_e1rm(weight: float, reps: int) -> float | None:
  """Brzycki formula: weight * (36 / (37 - reps))"""
  if reps <= 0 or reps >= 37 or weight <= 0:
    return None
  return round(weight * (36 / (37 - reps)), 1)


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

  def compute_e1rm(self, workout_set: WorkoutSet) -> None:
    """Calculate and set E1RM on the workout set."""
    workout_set.e1rm = calculate_e1rm(workout_set.weight, workout_set.reps)


workout_service = WorkoutService()
