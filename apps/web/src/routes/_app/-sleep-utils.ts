// Fixed stage -> colour mapping (entity-based, not sort order): calm
// night-time pastels, with Awake a warm peach so it reads as "not asleep"
// without looking like an alarm.
export const STAGE_ORDER = [
  "awake",
  "asleepREM",
  "asleepCore",
  "asleepUnspecified",
  "asleepDeep",
] as const;

export type StageKey = (typeof STAGE_ORDER)[number];

export const STAGE_META: Record<
  string,
  { label: string; color: string; hint: string }
> = {
  awake: {
    label: "Awake",
    color: "oklch(0.82 0.09 55)",
    hint: "Little wake-ups",
  },
  asleepREM: {
    label: "REM",
    color: "oklch(0.8 0.1 315)",
    hint: "Dreams and memory",
  },
  asleepCore: {
    label: "Core",
    color: "oklch(0.78 0.09 235)",
    hint: "Light, steady sleep",
  },
  asleepUnspecified: {
    label: "Asleep",
    color: "oklch(0.78 0.09 235)",
    hint: "Asleep",
  },
  asleepDeep: {
    label: "Deep",
    color: "oklch(0.66 0.12 280)",
    hint: "Rest and repair",
  },
};
