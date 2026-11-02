import type { GoalCreate, GoalScore } from "@bessel/client";
import { dayParam } from "@/routes/_app/-google-timeline-utils";

export type Metric = GoalCreate["metric"];

export const METRICS: { value: Metric; label: string; hint: string }[] = [
  {
    value: "sleep_before",
    label: "Asleep by a time",
    hint: "Nights your sleep started by the time, from Apple Health.",
  },
  {
    value: "wake_before",
    label: "Up by a time",
    hint: "Mornings you woke by the time, from Apple Health.",
  },
  {
    value: "gym_sessions",
    label: "Gym sessions",
    hint: "Days with a logged gym session or a strength workout.",
  },
  {
    value: "tasks_completed",
    label: "Tasks completed",
    hint: "Tasks you finished, in one project or all of them.",
  },
  {
    value: "people_met",
    label: "Met someone",
    hint: "Days you logged meeting a contact. Leave out tags such as family.",
  },
  {
    value: "net_worth",
    label: "Net worth",
    hint: "Cash and investments minus debt in one currency: a level to reach.",
  },
  {
    value: "manual",
    label: "Check in yourself",
    hint: "Anything else: you check in when you do it.",
  },
];

const PERIOD_WORD: Record<GoalScore["goal"]["period"], string> = {
  week: "this week",
  month: "this month",
  none: "",
};

function amount(value: number, unit: string): string {
  if (/^[A-Z]{3}$/.test(unit)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: unit,
      maximumFractionDigits: 0,
    })
      .format(value)
      .replace(/\u00a0/g, " ");
  }
  const rounded = Number.isInteger(value) ? value : value.toFixed(1);
  return unit ? `${rounded} ${unit}` : String(rounded);
}

/** "2 of 5 nights this week", "at most 3 this week", or "1.2M SEK of 7M SEK". */
export function progressLine(score: GoalScore): string {
  const { goal, current, unit } = score;
  const target = amount(goal.target, unit);
  const now = /^[A-Z]{3}$/.test(unit)
    ? amount(current.value, unit)
    : Number.isInteger(current.value)
      ? String(current.value)
      : current.value.toFixed(1);
  const period = PERIOD_WORD[goal.period];
  const limit = goal.comparison === "at_most" ? "at most " : "";
  return `${now} of ${limit}${target}${period ? ` ${period}` : ""}`;
}

/** The rung to aim for while the target is far off, in words. */
export function stepLine(score: GoalScore): string | null {
  if (score.step == null) return null;
  const rung = amount(score.step, score.unit);
  const word = score.goal.comparison === "at_most" ? "at most" : "";
  return `Next step: ${word ? `${word} ` : ""}${rung} ${PERIOD_WORD[score.goal.period]}`.trim();
}

export interface GoalDraft {
  title: string;
  metric: Metric;
  target: string;
  period: "week" | "month";
  atMost: boolean;
  time: string;
  project: string;
  excludeTags: string;
  currency: string;
  owner: "personal" | "company" | "all";
  deadline: string;
  isPrivate: boolean;
}

export const EMPTY_DRAFT: GoalDraft = {
  title: "",
  metric: "gym_sessions",
  target: "3",
  period: "week",
  atMost: false,
  time: "00:30",
  project: "",
  excludeTags: "",
  currency: "SEK",
  owner: "all",
  deadline: "",
  isPrivate: false,
};

/** The API body for a draft, or a reason it can't be saved yet. */
export function toGoalCreate(draft: GoalDraft): GoalCreate | string {
  const title = draft.title.trim();
  const target = Number(draft.target);
  if (!title) return "Give it a name.";
  if (!Number.isFinite(target) || target < 0) return "The target is a number.";
  const level = draft.metric === "net_worth";
  const params: NonNullable<GoalCreate["params"]> = {};
  if (draft.metric === "sleep_before" || draft.metric === "wake_before") {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time))
      return "The time is HH:MM.";
    params.time = draft.time;
  }
  if (draft.metric === "tasks_completed" && draft.project.trim())
    params.project = draft.project.trim();
  if (draft.metric === "people_met") {
    params.exclude_tags = draft.excludeTags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
  }
  if (level) {
    if (!/^[A-Za-z]{3}$/.test(draft.currency))
      return "The currency is a three-letter code.";
    params.currency = draft.currency.toUpperCase();
    params.owner = draft.owner;
  }
  return {
    title,
    metric: draft.metric,
    target,
    params,
    period: level ? "none" : draft.period,
    comparison: draft.atMost ? "at_most" : "at_least",
    deadline: draft.deadline ? dayParam(draft.deadline) : null,
    sensitivity: draft.isPrivate ? "private" : "normal",
  };
}
