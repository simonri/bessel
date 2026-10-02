// Fixed stage -> color mapping (entity-based, not sort order) validated with
// the dataviz skill's palette validator against this app's dark surface.
export const STAGE_ORDER = [
  "awake",
  "asleepREM",
  "asleepCore",
  "asleepUnspecified",
  "asleepDeep",
] as const;

export const STAGE_META: Record<string, { label: string; rgb: string }> = {
  awake: { label: "Awake", rgb: "201 133 0" },
  asleepREM: { label: "REM", rgb: "25 158 112" },
  asleepCore: { label: "Core", rgb: "57 135 229" },
  asleepUnspecified: { label: "Asleep", rgb: "57 135 229" },
  asleepDeep: { label: "Deep", rgb: "213 81 129" },
};
