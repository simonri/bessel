from datetime import date
from uuid import UUID

from api.exceptions import ConflictError, ResourceNotFound
from api.gym.repository import GymExerciseRepository, GymTopSetRepository
from api.gym.schemas import GymExerciseSummary, GymExerciseUpsert, GymMuscle, GymTopSetSchema
from api.models.gym import GymExercise, GymTopSet


def _ordered(muscles: list[GymMuscle]) -> list[str]:
  """Each muscle once, in GymMuscle's order, so the same choice always reads the same."""
  chosen = set(muscles)
  return [muscle.value for muscle in GymMuscle if muscle in chosen]


def _set_schema(top_set: GymTopSet) -> GymTopSetSchema:
  return GymTopSetSchema(performed_on=top_set.performed_on, weight_kg=float(top_set.weight_kg))


class GymService:
  async def list_exercises(self, exercises: GymExerciseRepository, sets: GymTopSetRepository, user_id: UUID) -> list[GymExerciseSummary]:
    recent: dict[UUID, list[GymTopSetSchema]] = {}
    for top_set in await sets.list_recent_by_exercise(user_id):
      recent.setdefault(top_set.exercise_id, []).append(_set_schema(top_set))
    best = {top_set.exercise_id: _set_schema(top_set) for top_set in await sets.list_best_by_exercise(user_id)}

    summaries = [
      GymExerciseSummary(
        id=exercise.id,
        name=exercise.name,
        muscles=[GymMuscle(muscle) for muscle in exercise.muscles],
        created_at=exercise.created_at,
        last_set=recent[exercise.id][-1] if exercise.id in recent else None,
        best_set=best.get(exercise.id),
        recent_sets=recent.get(exercise.id, []),
      )
      for exercise in await exercises.list_for_user(user_id)
    ]

    def last_trained(summary: GymExerciseSummary) -> date:
      return summary.last_set.performed_on if summary.last_set else summary.created_at.date()

    return sorted(summaries, key=lambda s: (last_trained(s), s.created_at), reverse=True)

  async def get_exercise(self, repo: GymExerciseRepository, exercise_id: UUID, user_id: UUID) -> GymExercise:
    return await repo.get_owned_or_404(exercise_id, user_id, not_found_message="Exercise not found")

  async def upsert_exercise(self, repo: GymExerciseRepository, exercise_id: UUID, user_id: UUID, body: GymExerciseUpsert) -> GymExercise:
    """Creates the exercise with the app's id, or renames it. Sending the same
    request again changes nothing, so the app can retry it after being offline."""
    existing = await repo.get_by_id(exercise_id)
    if existing is not None and existing.user_id != user_id:
      # Someone else's id: as if it didn't exist, and never take it over.
      raise ResourceNotFound("Exercise not found")

    clash = await repo.get_by_name(user_id, body.name)
    if clash is not None and clash.id != exercise_id:
      raise ConflictError(f"You already have an exercise called {clash.name}.")

    muscles = _ordered(body.muscles) if body.muscles is not None else None
    if existing is None:
      exercise = GymExercise(id=exercise_id, user_id=user_id, name=body.name, muscles=muscles or [])
      await repo.create(exercise, flush=True)
      return exercise
    changes: dict[str, object] = {}
    if existing.name != body.name:
      changes["name"] = body.name
    if muscles is not None and muscles != existing.muscles:
      changes["muscles"] = muscles
    if changes:
      await repo.update(existing, update_dict=changes, flush=True)
    return existing

  async def delete_exercise(self, repo: GymExerciseRepository, exercise_id: UUID, user_id: UUID) -> None:
    """Deletes the exercise and all its sets."""
    await repo.delete(await self.get_exercise(repo, exercise_id, user_id), flush=True)

  async def delete_set(self, sets: GymTopSetRepository, exercise: GymExercise, performed_on: date) -> None:
    top_set = await sets.get_for_day(exercise, performed_on)
    if top_set is None:
      raise ResourceNotFound("No top set on that day")
    await sets.delete(top_set, flush=True)


gym_service = GymService()
