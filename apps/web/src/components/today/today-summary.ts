import type { TaskSchema } from "@bessel/client";
import type { TimedCalendarEvent } from "@/components/calendar/calendar-types";
import { groupTasksByWhen } from "@/components/tasks/today-groups";
import { fmtDur } from "@/routes/_app/-activity-utils";

export interface NextEvent {
  event: TimedCalendarEvent;
  /** Already started and not over yet. */
  ongoing: boolean;
}

/** The event that's on now, or the next one to start; declined ones don't count. */
export function nextEvent(
  events: readonly TimedCalendarEvent[],
  now: Date,
): NextEvent | null {
  const upcoming = events
    .filter((e) => e.details.myResponse !== "declined" && e.end > now)
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const event = upcoming[0];
  return event ? { event, ongoing: event.start <= now } : null;
}

/** "in 5 min", "in 2 h 10 min", "in 3 days". */
export function countdown(from: Date, to: Date): string {
  const minutes = Math.max(
    0,
    Math.round((to.getTime() - from.getTime()) / 60_000),
  );
  if (minutes < 1) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? `in ${hours} h ${rest} min` : `in ${hours} h`;
  }
  const days = Math.round(hours / 24);
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

export interface TodayTasks {
  doing: TaskSchema[];
  inReview: TaskSchema[];
  /** Due today or earlier, earliest first; at most `limit`. */
  due: TaskSchema[];
  /** How many more are due today or earlier than `due` shows. */
  moreDue: number;
}

export function todayTasks(
  tasks: readonly TaskSchema[],
  now: Date,
  limit = 3,
): TodayTasks {
  const groups = groupTasksByWhen([...tasks], now);
  const get = (key: string) => groups.find((g) => g.key === key)?.tasks ?? [];
  const due = [...get("overdue"), ...get("today")];
  return {
    doing: get("doing"),
    inReview: get("review"),
    due: due.slice(0, limit),
    moreDue: Math.max(0, due.length - limit),
  };
}

const clock = (iso: string) => {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[1]}:${m[2]}` : null;
};

/** "You slept 7h 40m, from 01:10 to 09:15." */
export function sleepSentence(
  night: {
    asleep_secs: number;
    sleep_onset?: string | null;
    wake_time?: string | null;
  } | null,
): string {
  if (!night || night.asleep_secs <= 0) return "No sleep recorded last night.";
  const from = night.sleep_onset ? clock(night.sleep_onset) : null;
  const to = night.wake_time ? clock(night.wake_time) : null;
  const span = from && to ? `, from ${from} to ${to}` : "";
  return `You slept ${fmtDur(night.asleep_secs)}${span}.`;
}

/** "4h 12m at the computer so far, most of it in Chromium." */
export function screenSentence(
  summary: {
    total_active_secs: number;
    apps: { app_class: string }[];
  } | null,
): string {
  if (!summary || summary.total_active_secs <= 0)
    return "No screen time yet today.";
  const top = summary.apps[0]?.app_class;
  return `${fmtDur(summary.total_active_secs)} at the computer so far${top ? `, most of it in ${top}` : ""}.`;
}
