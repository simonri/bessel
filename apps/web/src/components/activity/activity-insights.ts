import type {
  ActivityDailyEntry,
  ActivityIntradayBucket,
} from "@bessel/client";
import { format, isSameDay, subDays } from "date-fns";
import { projectHue } from "@/components/tasks/project-colors";
import type { RibbonLane } from "@/components/timeline/day-summary";
import { LANE_META } from "@/components/timeline/day-summary";
import { fmtDur } from "@/routes/_app/-activity-utils";

/** Each app keeps the same pastel on every day, picked from its name. */
export function appHue(appClass: string): number {
  return projectHue(appClass);
}

export interface Session {
  startTs: number;
  endTs: number;
}

/** Consecutive active buckets as continuous sessions at the computer. */
export function sessionsFromBuckets(
  buckets: readonly ActivityIntradayBucket[],
  bucketMins: number,
  dayStartTs: number,
): Session[] {
  const step = bucketMins * 60;
  const sessions: Session[] = [];
  for (const b of [...buckets].sort((x, y) => x.bucket - y.bucket)) {
    const startTs = dayStartTs + b.bucket * step;
    const last = sessions.at(-1);
    if (last && last.endTs === startTs) last.endTs = startTs + step;
    else sessions.push({ startTs, endTs: startTs + step });
  }
  return sessions;
}

export function longestSession(sessions: readonly Session[]): Session | null {
  let best: Session | null = null;
  for (const s of sessions)
    if (!best || s.endTs - s.startTs > best.endTs - best.startTs) best = s;
  return best;
}

export function screenLane(
  sessions: readonly Session[],
  totalSecs: number,
): RibbonLane {
  const { title, hue } = LANE_META.pc;
  return {
    key: "pc",
    title,
    totalSecs,
    blocks: sessions.map((s) => ({ ...s, name: "At the computer", hue })),
  };
}

const USUAL_WINDOW_DAYS = 7;

/** Average of the past week's days with any activity, not counting `date`. */
export function usualSecs(
  days: readonly ActivityDailyEntry[],
  date: Date,
): number | null {
  const byDate = new Map(days.map((d) => [d.date, d.active_secs]));
  const values: number[] = [];
  for (let i = 1; i <= USUAL_WINDOW_DAYS; i++) {
    const secs = byDate.get(format(subDays(date, i), "yyyy-MM-dd"));
    if (secs) values.push(secs);
  }
  if (values.length < 3) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export interface WeekDay {
  date: Date;
  secs: number;
  isSelected: boolean;
  isToday: boolean;
}

/** The seven days ending with `date`. */
export function weekEndingOn(
  days: readonly ActivityDailyEntry[],
  date: Date,
  today: Date,
): WeekDay[] {
  const byDate = new Map(days.map((d) => [d.date, d.active_secs]));
  return Array.from({ length: 7 }, (_, i) => {
    const d = subDays(date, 6 - i);
    return {
      date: d,
      secs: byDate.get(format(d, "yyyy-MM-dd")) ?? 0,
      isSelected: isSameDay(d, date),
      isToday: isSameDay(d, today),
    };
  });
}

// Within ±10% of the usual counts as "about the same".
const SAME_BAND = 0.1;

export function comparedToUsual(
  secs: number,
  usual: number | null,
): { label: string; tone: "less" | "more" | "same" } | null {
  if (usual === null || secs === 0) return null;
  const diff = secs - usual;
  if (Math.abs(diff) <= usual * SAME_BAND)
    return { label: "about your usual", tone: "same" };
  return diff < 0
    ? { label: `${fmtDur(-diff)} less than usual`, tone: "less" }
    : { label: `${fmtDur(diff)} more than usual`, tone: "more" };
}

/** One friendly line about the day. */
export function activitySentence({
  totalSecs,
  usual,
  topApp,
  isToday,
}: {
  totalSecs: number;
  usual: number | null;
  topApp: string | null;
  isToday: boolean;
}): string {
  if (totalSecs === 0)
    return isToday
      ? "No screen time yet today - enjoy it."
      : "No screen time this day.";
  const compared = comparedToUsual(totalSecs, usual);
  const when = isToday ? " so far today" : "";
  const first = `${fmtDur(totalSecs)} at the computer${when}`;
  const second = compared ? ` - ${compared.label}` : "";
  const third = topApp ? `. Mostly ${topApp}.` : ".";
  return `${first}${second}${third}`;
}

/** "chromium" → "Chromium"; names with their own casing are left alone. */
export function prettyAppName(appClass: string): string {
  if (appClass !== appClass.toLowerCase()) return appClass;
  return appClass.charAt(0).toUpperCase() + appClass.slice(1);
}
