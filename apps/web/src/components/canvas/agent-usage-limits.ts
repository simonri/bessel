import { differenceInMinutes, format, roundToNearestMinutes } from "date-fns";

export interface UsageLimit {
  window_label: string;
  utilization_pct: number;
  resets_at?: string | Date | null;
  tier?: string | null;
  observed_at: string | Date;
}

const SCOPED_WEEKLY = /^(.+)_weekly_scoped$/;

/** Session first, then the all-models week, then per-model weeks. */
function rank(label: string): number {
  if (label === "session_5h") return 0;
  if (label === "week") return 1;
  return 2;
}

export function limitLabel(label: string): string {
  if (label === "session_5h") return "Session limit";
  if (label === "week") return "Weekly - all models";
  const scoped = SCOPED_WEEKLY.exec(label);
  if (scoped) return `Weekly - ${scoped[1]}`;
  return label.replace(/_/g, " ");
}

/** "default_claude_max_5x" -> "Max (5x)", "pro" -> "Pro". */
export function planLabel(tier: string | null | undefined): string | null {
  if (!tier) return null;
  const multiplied = /(max|pro|team|enterprise)_(\d+)x/i.exec(tier);
  if (multiplied) {
    const plan = multiplied[1].toLowerCase();
    return `${plan[0].toUpperCase()}${plan.slice(1)} (${multiplied[2]}x)`;
  }
  const plan = tier.replace(/^default_claude_/, "").replace(/_/g, " ");
  return plan ? `${plan[0].toUpperCase()}${plan.slice(1)}` : null;
}

/**
 * Within a day, a countdown ("Resets in 2 hr 59 min"); further out, the
 * moment itself ("Resets Mon 5:00 AM").
 */
export function resetLabel(resetsAt: Date, now: Date = new Date()): string {
  // Anthropic reports resets a hair before the hour (04:59:59.59).
  const at = roundToNearestMinutes(resetsAt);
  const minutes = differenceInMinutes(at, roundToNearestMinutes(now));
  if (minutes < 1) return "Reset";
  if (minutes >= 24 * 60) return `Resets ${format(at, "EEE h:mm a")}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0
    ? `Resets in ${hours} hr ${rest} min`
    : `Resets in ${rest} min`;
}

/**
 * One row per limit: every device reports the same account, so the newest
 * report of each wins.
 */
export function latestLimits<T extends UsageLimit>(entries: T[]): T[] {
  const byLabel = new Map<string, T>();
  for (const entry of entries) {
    const current = byLabel.get(entry.window_label);
    if (!current || new Date(entry.observed_at) > new Date(current.observed_at))
      byLabel.set(entry.window_label, entry);
  }
  return [...byLabel.values()].sort(
    (a, b) =>
      rank(a.window_label) - rank(b.window_label) ||
      a.window_label.localeCompare(b.window_label),
  );
}
