import { format, isPast, isToday, isTomorrow, isYesterday } from "date-fns";
import { Circle, CheckCircle2, Clock, CalendarClock, XCircle } from "lucide-react";
import type { TaskSchema } from "@bessel/client";

export const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  todo: { label: "Todo", icon: Circle, color: "text-white/35" },
  in_progress: { label: "In Progress", icon: Clock, color: "text-blue-400" },
  scheduled: { label: "Scheduled", icon: CalendarClock, color: "text-violet-400" },
  done: { label: "Done", icon: CheckCircle2, color: "text-emerald-400" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-white/25" },
};

export const PRIORITY_CONFIG: Record<number, { label: string; color: string; border: string }> = {
  0: { label: "None", color: "text-white/20", border: "" },
  1: { label: "Low", color: "text-white/40", border: "border-l-2 border-l-white/20" },
  2: { label: "Medium", color: "text-blue-400", border: "border-l-2 border-l-blue-400/70" },
  3: { label: "High", color: "text-primary-400", border: "border-l-2 border-l-primary-400" },
  4: { label: "Urgent", color: "text-red-400", border: "border-l-2 border-l-red-400" },
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

export function getDueDateColor(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isPast(d) && !isToday(d)) return "text-red-400";
  if (isToday(d)) return "text-primary-400";
  return "text-white/40";
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
