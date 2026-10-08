// Claude model ids ("claude-opus-5-5", "claude-haiku-4-5-20251001") as the
// families and short names people know them by.

export type ModelFamily = "opus" | "sonnet" | "haiku" | "fable" | "other";

export const FAMILY_ORDER: readonly ModelFamily[] = [
  "opus",
  "sonnet",
  "fable",
  "haiku",
  "other",
];

export const FAMILY_LABEL: Record<ModelFamily, string> = {
  opus: "Opus",
  sonnet: "Sonnet",
  haiku: "Haiku",
  fable: "Fable",
  other: "Other",
};

// Fixed per family (never cycled), from the dataviz default palette.
export const FAMILY_COLOR: Record<ModelFamily, string> = {
  opus: "#3987e5",
  sonnet: "#d95926",
  fable: "#199e70",
  haiku: "#c98500",
  other: "#8a8a93",
};

const MODEL_ID =
  /^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/;

export function modelFamily(model: string): ModelFamily {
  const family = MODEL_ID.exec(model)?.[1];
  return (family as ModelFamily | undefined) ?? "other";
}

/** "claude-opus-5-5" -> "Opus 5.5"; unknown ids are returned as they are. */
export function modelLabel(model: string): string {
  const match = MODEL_ID.exec(model);
  if (!match) return model;
  const [, family, major, minor] = match;
  const name = FAMILY_LABEL[family as ModelFamily];
  return minor ? `${name} ${major}.${minor}` : `${name} ${major}`;
}
