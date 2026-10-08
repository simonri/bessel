import type { TaskSchema } from "@bessel/client";
import { format, isPast, isToday, isTomorrow, isYesterday } from "date-fns";
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Clock,
  Eye,
  XCircle,
} from "lucide-react";

export const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string }
> = {
  todo: { label: "To do", icon: Circle, color: "text-white/35" },
  in_progress: { label: "Doing", icon: Clock, color: "text-sky-300" },
  in_review: { label: "In review", icon: Eye, color: "text-amber-300" },
  scheduled: {
    label: "Scheduled",
    icon: CalendarClock,
    color: "text-violet-400",
  },
  done: { label: "Done", icon: CheckCircle2, color: "text-emerald-400" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-white/25" },
};

// Priority never borrows the accent colour: the accent is the user's theme,
// not a warning.
export const PRIORITY_CONFIG: Record<
  number,
  { label: string; color: string; border: string }
> = {
  0: { label: "None", color: "text-white/20", border: "" },
  1: {
    label: "Low",
    color: "text-white/40",
    border: "border-l-2 border-l-white/20",
  },
  2: {
    label: "Medium",
    color: "text-sky-300",
    border: "border-l-2 border-l-sky-300/70",
  },
  3: {
    label: "High",
    color: "text-amber-300",
    border: "border-l-2 border-l-amber-300",
  },
  4: {
    label: "Urgent",
    color: "text-rose-400",
    border: "border-l-2 border-l-rose-400",
  },
};

export function isRepeatingTask(task: TaskSchema): boolean {
  return task.is_recurring === true;
}

export function isDoneStatus(status: string | null | undefined): boolean {
  return status === "done" || status === "cancelled";
}

function ordinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return "th";
  const last = n % 10;
  if (last === 1) return "st";
  if (last === 2) return "nd";
  if (last === 3) return "rd";
  return "th";
}

export function formatDueDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

export function getDueDateColor(
  value: Date | string | null | undefined,
): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isPast(d) && !isToday(d)) return "text-red-400";
  if (isToday(d)) return "text-primary-400";
  return "text-white/40";
}

export type DueTone = "overdue" | "today" | "upcoming";

const DAY_MS = 86_400_000;

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Due dates are date-only; read a "YYYY-MM-DD" string as a local day. */
export function parseDueDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(value);
}

/** Whole days from today to the due date: negative when overdue. */
export function daysUntilDue(
  value: Date | string,
  now: Date = new Date(),
): number {
  return Math.round(
    (startOfLocalDay(parseDueDate(value)) - startOfLocalDay(now)) / DAY_MS,
  );
}

/** A friendly due label and how urgent it should look. */
export function describeDue(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): { label: string; tone: DueTone } | null {
  if (!value) return null;
  const days = daysUntilDue(value, now);
  if (days < 0) {
    const late = -days;
    return {
      label: late === 1 ? "1 day late" : `${late} days late`,
      tone: "overdue",
    };
  }
  if (days === 0) return { label: "Today", tone: "today" };
  if (days === 1) return { label: "Tomorrow", tone: "upcoming" };
  const date = parseDueDate(value);
  if (days < 7) return { label: format(date, "EEE"), tone: "upcoming" };
  return { label: format(date, "MMM d"), tone: "upcoming" };
}

export function formatRecurrence(task: TaskSchema): string | null {
  if (!task.is_recurring || !task.rrule_frequency) return null;
  const interval = task.rrule_interval ?? 1;
  const freq = task.rrule_frequency;
  if (interval === 1) {
    if (freq === "daily") return "Daily";
    if (freq === "weekly") {
      if (task.rrule_day_of_week != null) {
        const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        return `Weekly on ${days[task.rrule_day_of_week]}`;
      }
      return "Weekly";
    }
    if (freq === "monthly") {
      if (task.rrule_day_of_month)
        return `Monthly on the ${task.rrule_day_of_month}${ordinalSuffix(task.rrule_day_of_month)}`;
      return "Monthly";
    }
    if (freq === "yearly") return "Yearly";
  }
  return `Every ${interval} ${freq}`;
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const el = document.createElement("textarea");
  el.value = text;
  el.style.cssText = "position:fixed;opacity:0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
  return Promise.resolve();
}

export function buildTaskPrompt(task: TaskSchema): string {
  const parts = [`Implement this task:\nTitle: ${task.title}`];
  if (task.description) parts.push(`Description: ${task.description}`);
  return parts.join("\n\n");
}
