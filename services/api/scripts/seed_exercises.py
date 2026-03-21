"""Seed the exercises table with a comprehensive exercise library.

Run: cd services/api && uv run python -m scripts.seed_exercises
"""

import asyncio
import sys
from pathlib import Path

# Add src to path so we can import api modules directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from api.models.exercise import Equipment, Exercise, MuscleCategory
from api.settings import settings
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

EXERCISES: list[dict] = [
  # --- Chest ---
  {"name": "Barbell Bench Press", "category": "chest", "equipment": "barbell"},
  {"name": "Incline Barbell Bench Press", "category": "chest", "equipment": "barbell"},
  {"name": "Decline Barbell Bench Press", "category": "chest", "equipment": "barbell"},
  {"name": "Close-Grip Bench Press", "category": "chest", "equipment": "barbell"},
  {"name": "Dumbbell Bench Press", "category": "chest", "equipment": "dumbbell"},
  {"name": "Incline Dumbbell Bench Press", "category": "chest", "equipment": "dumbbell"},
  {"name": "Decline Dumbbell Bench Press", "category": "chest", "equipment": "dumbbell"},
  {"name": "Dumbbell Fly", "category": "chest", "equipment": "dumbbell"},
  {"name": "Incline Dumbbell Fly", "category": "chest", "equipment": "dumbbell"},
  {"name": "Cable Fly", "category": "chest", "equipment": "cable"},
  {"name": "Low Cable Fly", "category": "chest", "equipment": "cable"},
  {"name": "High Cable Fly", "category": "chest", "equipment": "cable"},
  {"name": "Machine Chest Press", "category": "chest", "equipment": "machine"},
  {"name": "Pec Deck", "category": "chest", "equipment": "machine"},
  {"name": "Push-Up", "category": "chest", "equipment": "bodyweight"},
  {"name": "Dip (Chest)", "category": "chest", "equipment": "bodyweight"},
  # --- Back ---
  {"name": "Conventional Deadlift", "category": "back", "equipment": "barbell"},
  {"name": "Sumo Deadlift", "category": "back", "equipment": "barbell"},
  {"name": "Barbell Row", "category": "back", "equipment": "barbell"},
  {"name": "Pendlay Row", "category": "back", "equipment": "barbell"},
  {"name": "T-Bar Row", "category": "back", "equipment": "barbell"},
  {"name": "Dumbbell Row", "category": "back", "equipment": "dumbbell"},
  {"name": "Dumbbell Pullover", "category": "back", "equipment": "dumbbell"},
  {"name": "Pull-Up", "category": "back", "equipment": "bodyweight"},
  {"name": "Chin-Up", "category": "back", "equipment": "bodyweight"},
  {"name": "Lat Pulldown", "category": "back", "equipment": "cable"},
  {"name": "Close-Grip Lat Pulldown", "category": "back", "equipment": "cable"},
  {"name": "Seated Cable Row", "category": "back", "equipment": "cable"},
  {"name": "Face Pull", "category": "back", "equipment": "cable"},
  {"name": "Straight-Arm Pulldown", "category": "back", "equipment": "cable"},
  {"name": "Machine Row", "category": "back", "equipment": "machine"},
  {"name": "Chest-Supported Row", "category": "back", "equipment": "machine"},
  # --- Shoulders ---
  {"name": "Overhead Press", "category": "shoulders", "equipment": "barbell"},
  {"name": "Push Press", "category": "shoulders", "equipment": "barbell"},
  {"name": "Behind-the-Neck Press", "category": "shoulders", "equipment": "barbell"},
  {"name": "Barbell Upright Row", "category": "shoulders", "equipment": "barbell"},
  {"name": "Dumbbell Shoulder Press", "category": "shoulders", "equipment": "dumbbell"},
  {"name": "Arnold Press", "category": "shoulders", "equipment": "dumbbell"},
  {"name": "Lateral Raise", "category": "shoulders", "equipment": "dumbbell"},
  {"name": "Front Raise", "category": "shoulders", "equipment": "dumbbell"},
  {"name": "Rear Delt Fly", "category": "shoulders", "equipment": "dumbbell"},
  {"name": "Cable Lateral Raise", "category": "shoulders", "equipment": "cable"},
  {"name": "Cable Front Raise", "category": "shoulders", "equipment": "cable"},
  {"name": "Machine Shoulder Press", "category": "shoulders", "equipment": "machine"},
  {"name": "Reverse Pec Deck", "category": "shoulders", "equipment": "machine"},
  {"name": "Dumbbell Shrug", "category": "shoulders", "equipment": "dumbbell"},
  {"name": "Barbell Shrug", "category": "shoulders", "equipment": "barbell"},
  # --- Biceps ---
  {"name": "Barbell Curl", "category": "biceps", "equipment": "barbell"},
  {"name": "EZ-Bar Curl", "category": "biceps", "equipment": "barbell"},
  {"name": "Preacher Curl", "category": "biceps", "equipment": "barbell"},
  {"name": "Dumbbell Curl", "category": "biceps", "equipment": "dumbbell"},
  {"name": "Hammer Curl", "category": "biceps", "equipment": "dumbbell"},
  {"name": "Incline Dumbbell Curl", "category": "biceps", "equipment": "dumbbell"},
  {"name": "Concentration Curl", "category": "biceps", "equipment": "dumbbell"},
  {"name": "Cable Curl", "category": "biceps", "equipment": "cable"},
  {"name": "Cable Hammer Curl", "category": "biceps", "equipment": "cable"},
  {"name": "Machine Curl", "category": "biceps", "equipment": "machine"},
  # --- Triceps ---
  {"name": "Skull Crusher", "category": "triceps", "equipment": "barbell"},
  {"name": "Close-Grip Bench Press", "category": "triceps", "equipment": "barbell"},
  {"name": "Dumbbell Tricep Extension", "category": "triceps", "equipment": "dumbbell"},
  {"name": "Dumbbell Kickback", "category": "triceps", "equipment": "dumbbell"},
  {"name": "Overhead Dumbbell Tricep Extension", "category": "triceps", "equipment": "dumbbell"},
  {"name": "Tricep Pushdown", "category": "triceps", "equipment": "cable"},
  {"name": "Overhead Cable Tricep Extension", "category": "triceps", "equipment": "cable"},
  {"name": "Rope Pushdown", "category": "triceps", "equipment": "cable"},
  {"name": "Dip (Tricep)", "category": "triceps", "equipment": "bodyweight"},
  {"name": "Diamond Push-Up", "category": "triceps", "equipment": "bodyweight"},
  # --- Forearms ---
  {"name": "Wrist Curl", "category": "forearms", "equipment": "barbell"},
  {"name": "Reverse Wrist Curl", "category": "forearms", "equipment": "barbell"},
  {"name": "Farmer's Walk", "category": "forearms", "equipment": "dumbbell"},
  {"name": "Reverse Curl", "category": "forearms", "equipment": "barbell"},
  # --- Quads ---
  {"name": "Barbell Back Squat", "category": "quads", "equipment": "barbell"},
  {"name": "Barbell Front Squat", "category": "quads", "equipment": "barbell"},
  {"name": "Goblet Squat", "category": "quads", "equipment": "dumbbell"},
  {"name": "Bulgarian Split Squat", "category": "quads", "equipment": "dumbbell"},
  {"name": "Dumbbell Lunge", "category": "quads", "equipment": "dumbbell"},
  {"name": "Barbell Lunge", "category": "quads", "equipment": "barbell"},
  {"name": "Walking Lunge", "category": "quads", "equipment": "dumbbell"},
  {"name": "Leg Press", "category": "quads", "equipment": "machine"},
  {"name": "Hack Squat", "category": "quads", "equipment": "machine"},
  {"name": "Leg Extension", "category": "quads", "equipment": "machine"},
  {"name": "Step-Up", "category": "quads", "equipment": "dumbbell"},
  {"name": "Sissy Squat", "category": "quads", "equipment": "bodyweight"},
  # --- Hamstrings ---
  {"name": "Romanian Deadlift", "category": "hamstrings", "equipment": "barbell"},
  {"name": "Stiff-Leg Deadlift", "category": "hamstrings", "equipment": "barbell"},
  {"name": "Dumbbell Romanian Deadlift", "category": "hamstrings", "equipment": "dumbbell"},
  {"name": "Lying Leg Curl", "category": "hamstrings", "equipment": "machine"},
  {"name": "Seated Leg Curl", "category": "hamstrings", "equipment": "machine"},
  {"name": "Good Morning", "category": "hamstrings", "equipment": "barbell"},
  {"name": "Nordic Hamstring Curl", "category": "hamstrings", "equipment": "bodyweight"},
  {"name": "Glute-Ham Raise", "category": "hamstrings", "equipment": "bodyweight"},
  # --- Glutes ---
  {"name": "Hip Thrust", "category": "glutes", "equipment": "barbell"},
  {"name": "Barbell Glute Bridge", "category": "glutes", "equipment": "barbell"},
  {"name": "Cable Pull-Through", "category": "glutes", "equipment": "cable"},
  {"name": "Cable Kickback", "category": "glutes", "equipment": "cable"},
  {"name": "Hip Abduction Machine", "category": "glutes", "equipment": "machine"},
  {"name": "Sumo Squat", "category": "glutes", "equipment": "dumbbell"},
  # --- Calves ---
  {"name": "Standing Calf Raise", "category": "calves", "equipment": "machine"},
  {"name": "Seated Calf Raise", "category": "calves", "equipment": "machine"},
  {"name": "Leg Press Calf Raise", "category": "calves", "equipment": "machine"},
  {"name": "Dumbbell Calf Raise", "category": "calves", "equipment": "dumbbell"},
  {"name": "Barbell Calf Raise", "category": "calves", "equipment": "barbell"},
  # --- Core ---
  {"name": "Plank", "category": "core", "equipment": "bodyweight"},
  {"name": "Side Plank", "category": "core", "equipment": "bodyweight"},
  {"name": "Hanging Leg Raise", "category": "core", "equipment": "bodyweight"},
  {"name": "Hanging Knee Raise", "category": "core", "equipment": "bodyweight"},
  {"name": "Ab Wheel Rollout", "category": "core", "equipment": "other"},
  {"name": "Cable Crunch", "category": "core", "equipment": "cable"},
  {"name": "Cable Woodchop", "category": "core", "equipment": "cable"},
  {"name": "Decline Sit-Up", "category": "core", "equipment": "bodyweight"},
  {"name": "Russian Twist", "category": "core", "equipment": "bodyweight"},
  {"name": "Dragon Flag", "category": "core", "equipment": "bodyweight"},
  {"name": "V-Up", "category": "core", "equipment": "bodyweight"},
  {"name": "Dead Bug", "category": "core", "equipment": "bodyweight"},
  # --- Olympic ---
  {"name": "Clean", "category": "olympic", "equipment": "barbell"},
  {"name": "Clean and Jerk", "category": "olympic", "equipment": "barbell"},
  {"name": "Snatch", "category": "olympic", "equipment": "barbell"},
  {"name": "Power Clean", "category": "olympic", "equipment": "barbell"},
  {"name": "Hang Clean", "category": "olympic", "equipment": "barbell"},
  {"name": "Push Jerk", "category": "olympic", "equipment": "barbell"},
  {"name": "Clean Pull", "category": "olympic", "equipment": "barbell"},
  {"name": "Snatch Pull", "category": "olympic", "equipment": "barbell"},
  # --- Cardio ---
  {"name": "Treadmill Run", "category": "cardio", "equipment": "machine"},
  {"name": "Rowing Machine", "category": "cardio", "equipment": "machine"},
  {"name": "Cycling (Stationary)", "category": "cardio", "equipment": "machine"},
  {"name": "Stair Climber", "category": "cardio", "equipment": "machine"},
  {"name": "Elliptical", "category": "cardio", "equipment": "machine"},
  {"name": "Jump Rope", "category": "cardio", "equipment": "other"},
  {"name": "Kettlebell Swing", "category": "cardio", "equipment": "kettlebell"},
  {"name": "Battle Ropes", "category": "cardio", "equipment": "other"},
  {"name": "Box Jump", "category": "cardio", "equipment": "bodyweight"},
  {"name": "Burpee", "category": "cardio", "equipment": "bodyweight"},
]


async def seed() -> None:
  dsn = settings.get_postgres_dsn("asyncpg")
  engine = create_async_engine(dsn)
  async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)  # type: ignore[call-overload]

  async with async_session() as session:
    result = await session.execute(
      select(Exercise).where(Exercise.is_custom == False).limit(1)  # noqa: E712
    )
    if result.scalar_one_or_none() is not None:
      print("Exercises already seeded, skipping.")
      return

    for data in EXERCISES:
      exercise = Exercise(
        name=data["name"],
        category=MuscleCategory(data["category"]),
        equipment=Equipment(data["equipment"]),
        is_custom=False,
      )
      session.add(exercise)

    await session.commit()
    print(f"Seeded {len(EXERCISES)} exercises.")

  await engine.dispose()


if __name__ == "__main__":
  asyncio.run(seed())
