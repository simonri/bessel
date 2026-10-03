import type { EventTimingInput, RecurrenceSchema } from "@bessel/client";
import { addDays, format, getDate, getDay } from "date-fns";

/** The fields the editor works with. Times are wall-clock Dates in the
 *  calendar's display zone; all-day end dates are exclusive. */
export interface EventDraftTiming {
  allDay: boolean;
  start: Date;
  end: Date;
}

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

/** Wall-clock fields only: the API pairs them with `time_zone`, so the
 *  browser's own zone never leaks in (unlike toISOString()). */
export function wallClock(date: Date): string {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function timingPayload(
  timing: EventDraftTiming,
  timeZone: string,
): EventTimingInput {
  if (timing.allDay) {
    return {
      start: { date: format(timing.start, "yyyy-MM-dd") },
      end: { date: format(timing.end, "yyyy-MM-dd") },
      time_zone: timeZone,
    };
  }
  return {
    start: { date_time: wallClock(timing.start) },
    end: { date_time: wallClock(timing.end) },
    time_zone: timeZone,
  };
}

/** Switches between timed and all-day while keeping the same day(s). */
export function toggleAllDay(timing: EventDraftTiming): EventDraftTiming {
  const day = new Date(
    timing.start.getFullYear(),
    timing.start.getMonth(),
    timing.start.getDate(),
  );
  if (timing.allDay) {
    const start = new Date(day);
    start.setHours(9);
    return { allDay: false, start, end: new Date(start.getTime() + 3600_000) };
  }
  const lastDay = new Date(
    timing.end.getFullYear(),
    timing.end.getMonth(),
    timing.end.getDate(),
  );
  // An event ending at midnight doesn't occupy the next day.
  const endsAtMidnight =
    timing.end.getHours() === 0 && timing.end.getMinutes() === 0;
  const end = addDays(lastDay, endsAtMidnight && lastDay > day ? 0 : 1);
  return { allDay: true, start: day, end };
}

/** Moves the start while keeping the duration, as calendar apps do. */
export function withStart(
  timing: EventDraftTiming,
  start: Date,
): EventDraftTiming {
  const duration = timing.end.getTime() - timing.start.getTime();
  return { ...timing, start, end: new Date(start.getTime() + duration) };
}

/** Sets the end, clamping so the event never ends before it starts. */
export function withEnd(timing: EventDraftTiming, end: Date): EventDraftTiming {
  const minimum = timing.allDay
    ? addDays(timing.start, 1)
    : new Date(timing.start.getTime() + 15 * 60_000);
  return { ...timing, end: end < minimum ? minimum : end };
}

export type RepeatPresetKey =
  | "none"
  | "daily"
  | "weekdays"
  | "weekly"
  | "monthly"
  | "yearly"
  | "custom";

export interface RepeatPreset {
  key: RepeatPresetKey;
  label: string;
  recurrence: RecurrenceSchema | null;
}

function ordinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ??
        "th");
  return `${n}${suffix}`;
}

/** The repeat choices offered for an event starting on `start`. */
export function repeatPresets(start: Date): RepeatPreset[] {
  const weekday = WEEKDAY_CODES[getDay(start)];
  return [
    { key: "none", label: "Does not repeat", recurrence: null },
    { key: "daily", label: "Every day", recurrence: rec("daily") },
    {
      key: "weekdays",
      label: "Every weekday (Mon–Fri)",
      recurrence: rec("weekly", ["MO", "TU", "WE", "TH", "FR"]),
    },
    {
      key: "weekly",
      label: `Every week on ${WEEKDAY_NAMES[getDay(start)]}`,
      recurrence: rec("weekly", [weekday]),
    },
    {
      key: "monthly",
      label: `Every month on the ${ordinal(getDate(start))}`,
      recurrence: rec("monthly"),
    },
    {
      key: "yearly",
      label: `Every year on ${format(start, "MMM d")}`,
      recurrence: rec("yearly"),
    },
  ];
}

function rec(
  frequency: RecurrenceSchema["frequency"],
  by_weekday: WeekdayCode[] = [],
): RecurrenceSchema {
  return { frequency, interval: 1, by_weekday, count: null, until: null };
}

/** Which preset an existing rule matches; "custom" for anything else. */
export function presetFor(
  recurrence: RecurrenceSchema | null,
  hasRule: boolean,
  start: Date,
): RepeatPresetKey {
  if (!recurrence) return hasRule ? "custom" : "none";
  if (
    (recurrence.interval ?? 1) !== 1 ||
    recurrence.count ||
    recurrence.until
  ) {
    return "custom";
  }
  const days = [...(recurrence.by_weekday ?? [])].sort().join(",");
  switch (recurrence.frequency) {
    case "daily":
      return days ? "custom" : "daily";
    case "weekly":
      if (days === "FR,MO,TH,TU,WE") return "weekdays";
      if (!days || days === WEEKDAY_CODES[getDay(start)]) return "weekly";
      return "custom";
    case "monthly":
      return "monthly";
    case "yearly":
      return "yearly";
  }
}

/** Short human description of a rule, for read-only display. */
export function describeRecurrence(
  recurrence: RecurrenceSchema | null,
  start: Date,
): string {
  if (!recurrence) return "Repeats";
  const interval = recurrence.interval ?? 1;
  const every = interval > 1 ? `Every ${interval} ` : "";
  const unit = {
    daily: interval > 1 ? "days" : "Daily",
    weekly: interval > 1 ? "weeks" : "Weekly",
    monthly: interval > 1 ? "months" : "Monthly",
    yearly: interval > 1 ? "years" : "Yearly",
  }[recurrence.frequency];
  let text = `${every}${unit}`;
  const days = recurrence.by_weekday ?? [];
  if (recurrence.frequency === "weekly") {
    const names = (days.length ? days : [WEEKDAY_CODES[getDay(start)]]).map(
      (code) => WEEKDAY_NAMES[WEEKDAY_CODES.indexOf(code)].slice(0, 3),
    );
    text += ` on ${names.join(", ")}`;
  }
  if (recurrence.count) text += `, ${recurrence.count} times`;
  if (recurrence.until) {
    text += `, until ${format(new Date(`${recurrence.until}T00:00`), "MMM d, yyyy")}`;
  }
  return text;
}
