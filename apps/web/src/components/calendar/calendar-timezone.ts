import { useState } from "react";

const STORAGE_KEY = "bessel:calendar-timezone";

export const systemTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = wallClockFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    wallClockFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/**
 * A Date whose *local* fields read as the wall-clock time in `timeZone`.
 * The grid lays events out from local hours/minutes, so shifting instants this
 * way renders any zone without threading it through every date computation.
 */
export function toWallClock(date: Date, timeZone: string): Date {
  if (timeZone === systemTimeZone()) return date;
  const parts: Record<string, number> = {};
  for (const { type, value } of wallClockFormatter(timeZone).formatToParts(
    date,
  )) {
    if (type !== "literal") parts[type] = Number(value);
  }
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
    date.getMilliseconds(),
  );
}

function offsetMs(instant: number, timeZone: string): number {
  const wall = toWallClock(new Date(instant), timeZone);
  const wallAsUtc = Date.UTC(
    wall.getFullYear(),
    wall.getMonth(),
    wall.getDate(),
    wall.getHours(),
    wall.getMinutes(),
    wall.getSeconds(),
    wall.getMilliseconds(),
  );
  return wallAsUtc - instant;
}

/** The instant whose wall-clock time in `timeZone` is `wall`'s local fields;
 *  the inverse of toWallClock. Nonexistent DST-gap times resolve forwards. */
export function fromWallClock(wall: Date, timeZone: string): Date {
  if (timeZone === systemTimeZone()) return wall;
  const asUtc = Date.UTC(
    wall.getFullYear(),
    wall.getMonth(),
    wall.getDate(),
    wall.getHours(),
    wall.getMinutes(),
    wall.getSeconds(),
    wall.getMilliseconds(),
  );
  // Two passes: the offset at the first guess can differ near DST changes.
  const guess = asUtc - offsetMs(asUtc, timeZone);
  return new Date(asUtc - offsetMs(guess, timeZone));
}

function zoneName(
  timeZone: string,
  date: Date,
  style: "shortOffset" | "longOffset" | "long",
): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: style })
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")?.value ?? ""
  );
}

/** `GMT+2` style label for the grid gutter. */
export function shortOffsetLabel(timeZone: string, date: Date): string {
  return zoneName(timeZone, date, "shortOffset");
}

export interface TimeZoneOption {
  id: string;
  /** `GMT+02:00`; plain `GMT` is normalized to `GMT+00:00` so columns align. */
  offset: string;
  offsetMinutes: number;
  name: string;
  city: string;
}

function parseOffset(longOffset: string): number {
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(longOffset);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

export function timeZoneOptions(at: Date): TimeZoneOption[] {
  const ids = Intl.supportedValuesOf("timeZone");
  if (!ids.includes(systemTimeZone())) ids.push(systemTimeZone());
  return ids
    .map((id) => {
      const longOffset = zoneName(id, at, "longOffset");
      return {
        id,
        offset: longOffset === "GMT" ? "GMT+00:00" : longOffset,
        offsetMinutes: parseOffset(longOffset),
        name: zoneName(id, at, "long"),
        city: (id.split("/").at(-1) ?? id).replaceAll("_", " "),
      };
    })
    .sort(
      (a, b) =>
        a.offsetMinutes - b.offsetMinutes ||
        a.name.localeCompare(b.name) ||
        a.city.localeCompare(b.city),
    );
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function readStoredTimeZone(): string | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && isValidTimeZone(stored) ? stored : null;
  } catch {
    return null;
  }
}

/** The zone the calendar displays in; defaults to the system zone, per device. */
export function useCalendarTimeZone(): [string, (timeZone: string) => void] {
  const [timeZone, setTimeZone] = useState(
    () => readStoredTimeZone() ?? systemTimeZone(),
  );
  const update = (next: string) => {
    setTimeZone(next);
    try {
      if (next === systemTimeZone()) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable (private window); the choice lasts this session.
    }
  };
  return [timeZone, update];
}
