import type {
  TimeEntrySchema,
  TimeMonthTotal,
  TimeProjectSchema,
} from "@bessel/client";
import { format } from "date-fns";
import { GOOGLE_EVENT_COLORS, MENU_COLORS } from "../calendar/event-colors";

/** The colours a project can take: the same set calendar events offer. */
export const PROJECT_COLORS = MENU_COLORS.map((c) => ({
  label: c.label,
  hex: GOOGLE_EVENT_COLORS[c.id],
}));

export function nextProjectColor(projects: TimeProjectSchema[]): string {
  const used = new Set(projects.map((p) => p.color.toLowerCase()));
  return (
    PROJECT_COLORS.find((c) => !used.has(c.hex.toLowerCase()))?.hex ??
    PROJECT_COLORS[projects.length % PROJECT_COLORS.length].hex
  );
}

/** Hours as a consultant writes them: "7.5 h", "0.25 h", "12 h". */
export function formatHours(seconds: number): string {
  const hours = Math.round((seconds / 3600) * 100) / 100;
  return `${hours.toLocaleString("en-US", { maximumFractionDigits: 2 })} h`;
}

export function formatAmount(amount: number, currency: string | null): string {
  const value = Math.round(amount).toLocaleString("en-US");
  return currency ? `${value} ${currency}` : value;
}

/** Seconds of `entry` that fall between `start` and `end`. */
export function overlapSeconds(
  entry: Pick<TimeEntrySchema, "start_ts" | "end_ts">,
  start: Date,
  end: Date,
): number {
  const from = Math.max(entry.start_ts.getTime(), start.getTime());
  const to = Math.min(entry.end_ts.getTime(), end.getTime());
  return Math.max(0, (to - from) / 1000);
}

export interface ProjectTotal {
  projectId: string;
  seconds: number;
}

/** Time per project inside a range, most first. */
export function projectTotals(
  entries: TimeEntrySchema[],
  start: Date,
  end: Date,
): ProjectTotal[] {
  const seconds = new Map<string, number>();
  for (const entry of entries) {
    const secs = overlapSeconds(entry, start, end);
    if (secs > 0)
      seconds.set(
        entry.time_project_id,
        (seconds.get(entry.time_project_id) ?? 0) + secs,
      );
  }
  return [...seconds]
    .map(([projectId, secs]) => ({ projectId, seconds: secs }))
    .sort((a, b) => b.seconds - a.seconds);
}

/** Ids of entries that overlap another entry. */
export function overlappingIds(entries: TimeEntrySchema[]): Set<string> {
  const sorted = [...entries].sort(
    (a, b) => a.start_ts.getTime() - b.start_ts.getTime(),
  );
  const ids = new Set<string>();
  let latest: TimeEntrySchema | null = null;
  for (const entry of sorted) {
    if (latest && entry.start_ts < latest.end_ts) {
      ids.add(entry.id);
      ids.add(latest.id);
    }
    if (!latest || entry.end_ts > latest.end_ts) latest = entry;
  }
  return ids;
}

export interface MonthRow {
  project: TimeProjectSchema;
  /** Seconds for January..December. */
  months: number[];
  total: number;
}

/** One row per project with time this year (or still active), in project order. */
export function monthRows(
  totals: TimeMonthTotal[],
  projects: TimeProjectSchema[],
): MonthRow[] {
  const byProject = new Map<string, number[]>();
  for (const t of totals) {
    const months =
      byProject.get(t.time_project_id) ?? Array<number>(12).fill(0);
    months[t.month - 1] += t.seconds;
    byProject.set(t.time_project_id, months);
  }
  return projects
    .filter((p) => byProject.has(p.id) || !p.archived_at)
    .map((project) => {
      const months = byProject.get(project.id) ?? Array<number>(12).fill(0);
      return {
        project,
        months,
        total: months.reduce((a, b) => a + b, 0),
      };
    });
}

export function amountFor(project: TimeProjectSchema, seconds: number) {
  return project.hourly_rate == null
    ? null
    : (seconds / 3600) * project.hourly_rate;
}

/** A month's hours per project as plain text, ready for an invoice or email. */
export function monthText(
  rows: MonthRow[],
  year: number,
  monthIndex: number,
): string {
  const lines = [format(new Date(year, monthIndex, 1), "MMMM yyyy")];
  let total = 0;
  for (const { project, months } of rows) {
    const seconds = months[monthIndex];
    if (seconds <= 0) continue;
    total += seconds;
    const amount = amountFor(project, seconds);
    const name = project.client
      ? `${project.client} - ${project.name}`
      : project.name;
    lines.push(
      `${name}: ${formatHours(seconds)}${amount === null ? "" : ` (${formatAmount(amount, project.currency)})`}`,
    );
  }
  lines.push(`Total: ${formatHours(total)}`);
  return lines.join("\n");
}
