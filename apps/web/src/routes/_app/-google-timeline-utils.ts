import type { LocationActivity, LocationVisit } from "@bessel/client";
import {
  Bike,
  Bus,
  Car,
  Footprints,
  type LucideIcon,
  MountainSnow,
  Navigation,
  Plane,
  Ship,
  TrainFront,
  TramFront,
} from "lucide-react";

/** A calendar date as "yyyy-mm-dd", independent of any time zone. */
export type IsoDay = string;

export function isoDay(date: Date): IsoDay {
  return date.toISOString().slice(0, 10);
}

/** The API takes the day as a Date at UTC midnight. */
export function dayParam(day: IsoDay): Date {
  return new Date(`${day}T00:00:00Z`);
}

/** long: "Fri, Oct 2, 2026"; medium: "Oct 2, 2026"; short: "Oct 2". */
export function formatDay(
  day: IsoDay,
  pattern: "long" | "medium" | "short" = "long",
) {
  return dayParam(day).toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: pattern === "long" ? "short" : undefined,
    month: "short",
    day: "numeric",
    year: pattern === "short" ? undefined : "numeric",
  });
}

/** Nearest day with data before or after `day`, or null at either end. */
export function adjacentDay(
  days: IsoDay[],
  day: IsoDay,
  direction: -1 | 1,
): IsoDay | null {
  if (direction === 1) return days.find((d) => d > day) ?? null;
  return [...days].reverse().find((d) => d < day) ?? null;
}

/** The instant as wall-clock time where it happened. */
function wallClock(at: Date, offsetMinutes: number | null): Date {
  return new Date(at.getTime() + (offsetMinutes ?? 0) * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:05" in the segment's own time zone; prefixed with the date when it
 *  isn't on `day`, e.g. a night that started the evening before. */
export function localTime(
  at: Date,
  offsetMinutes: number | null,
  day?: IsoDay,
): string {
  const wall = wallClock(at, offsetMinutes);
  const time = `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
  const onDay = isoDay(wall);
  return day && onDay !== day ? `${formatDay(onDay, "short")}, ${time}` : time;
}

export function utcOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  const minutes = abs % 60;
  return `GMT${sign}${Math.floor(abs / 60)}${minutes ? `:${pad(minutes)}` : ""}`;
}

export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

const ACTIVITIES: Record<string, { label: string; icon: LucideIcon }> = {
  walking: { label: "Walking", icon: Footprints },
  running: { label: "Running", icon: Footprints },
  hiking: { label: "Hiking", icon: Footprints },
  cycling: { label: "Cycling", icon: Bike },
  motorcycling: { label: "Motorcycling", icon: Bike },
  "in passenger vehicle": { label: "Driving", icon: Car },
  driving: { label: "Driving", icon: Car },
  "in vehicle": { label: "Driving", icon: Car },
  "in taxi": { label: "Taxi", icon: Car },
  "in bus": { label: "Bus", icon: Bus },
  "in train": { label: "Train", icon: TrainFront },
  "in subway": { label: "Subway", icon: TrainFront },
  "in tram": { label: "Tram", icon: TramFront },
  flying: { label: "Flight", icon: Plane },
  "in ferry": { label: "Ferry", icon: Ship },
  sailing: { label: "Sailing", icon: Ship },
  skiing: { label: "Skiing", icon: MountainSnow },
};

/** Android writes "IN_PASSENGER_VEHICLE", iOS "in passenger vehicle". */
export function activityInfo(type: string | null): {
  label: string;
  icon: LucideIcon;
} {
  const key = (type ?? "").toLowerCase().replaceAll("_", " ").trim();
  return (
    ACTIVITIES[key] ?? {
      label: key ? key[0].toUpperCase() + key.slice(1) : "Moving",
      icon: Navigation,
    }
  );
}

const SEMANTIC_LABELS: Record<string, string> = {
  home: "Home",
  "inferred home": "Home",
  work: "Work",
  "inferred work": "Work",
  "searched address": "Searched address",
};

export function visitTitle(visit: LocationVisit): string {
  if (visit.name) return visit.name;
  const semantic = (visit.semantic_type ?? "")
    .toLowerCase()
    .replaceAll("_", " ");
  return SEMANTIC_LABELS[semantic] ?? "Unnamed place";
}

export function visitSubtitle(visit: LocationVisit): string | null {
  if (visit.address) return visit.address;
  if (visit.latitude == null || visit.longitude == null) return null;
  return `${visit.latitude.toFixed(5)}, ${visit.longitude.toFixed(5)}`;
}

export function mapsUrl(visit: LocationVisit): string | null {
  if (visit.latitude == null || visit.longitude == null) return null;
  const params = new URLSearchParams({
    api: "1",
    query: `${visit.latitude},${visit.longitude}`,
  });
  if (visit.place_id) params.set("query_place_id", visit.place_id);
  return `https://www.google.com/maps/search/?${params}`;
}

export type DayEntry =
  | { kind: "visit"; visit: LocationVisit; children: LocationVisit[] }
  | { kind: "activity"; activity: LocationActivity };

/** Top-level visits and trips in time order, with visits inside a visit
 *  (a shop in a mall) nested under it. */
export function dayEntries(
  visits: LocationVisit[],
  activities: LocationActivity[],
): DayEntry[] {
  const top = visits.filter((v) => v.hierarchy_level === 0);
  const nested = visits.filter((v) => v.hierarchy_level > 0);
  const entries: (DayEntry & { start: number })[] = [
    ...top.map((visit) => ({
      kind: "visit" as const,
      visit,
      start: visit.start_at.getTime(),
      children: nested.filter(
        (child) =>
          child.start_at >= visit.start_at && child.end_at <= visit.end_at,
      ),
    })),
    ...activities.map((activity) => ({
      kind: "activity" as const,
      activity,
      start: activity.start_at.getTime(),
    })),
  ];
  // A visit and the trip leaving it can share an instant; the visit comes first.
  entries.sort((a, b) => a.start - b.start || (a.kind === "visit" ? -1 : 1));

  // Google splits a long stay (often at midnight); with no trip in between
  // it's one stay.
  const merged: DayEntry[] = [];
  for (const entry of entries) {
    const last = merged.at(-1);
    if (
      entry.kind === "visit" &&
      last?.kind === "visit" &&
      entry.visit.place_id !== null &&
      entry.visit.place_id === last.visit.place_id
    ) {
      merged[merged.length - 1] = {
        kind: "visit",
        visit: {
          ...last.visit,
          end_at:
            entry.visit.end_at > last.visit.end_at
              ? entry.visit.end_at
              : last.visit.end_at,
        },
        children: [...last.children, ...entry.children],
      };
    } else {
      merged.push(
        entry.kind === "visit"
          ? { kind: "visit", visit: entry.visit, children: entry.children }
          : { kind: "activity", activity: entry.activity },
      );
    }
  }
  return merged;
}

/** Milliseconds of the segment within `day`, in its own local time. */
function msWithinDay(
  segment: { start_at: Date; end_at: Date; utc_offset_minutes: number | null },
  day: IsoDay,
): number {
  const dayStart =
    dayParam(day).getTime() - (segment.utc_offset_minutes ?? 0) * 60_000;
  const start = Math.max(segment.start_at.getTime(), dayStart);
  const end = Math.min(segment.end_at.getTime(), dayStart + 86_400_000);
  return Math.max(0, end - start);
}

export function dayStats(
  visits: LocationVisit[],
  activities: LocationActivity[],
  day: IsoDay,
) {
  return {
    places: new Set(
      visits
        .filter((v) => v.hierarchy_level === 0)
        .map((v) => v.place_id ?? `${v.latitude},${v.longitude}`),
    ).size,
    trips: activities.length,
    distance: activities.reduce((sum, a) => sum + (a.distance_meters ?? 0), 0),
    moving: activities.reduce((sum, a) => sum + msWithinDay(a, day), 0),
  };
}

/** The UTC offset most of the day was spent in. */
export function dayOffset(
  visits: LocationVisit[],
  activities: LocationActivity[],
): number | null {
  const time = new Map<number, number>();
  for (const s of [...visits, ...activities]) {
    if (s.utc_offset_minutes == null) continue;
    const span = s.end_at.getTime() - s.start_at.getTime();
    time.set(
      s.utc_offset_minutes,
      (time.get(s.utc_offset_minutes) ?? 0) + span,
    );
  }
  let best: number | null = null;
  for (const [offset, span] of time) {
    if (best === null || span > (time.get(best) ?? 0)) best = offset;
  }
  return best;
}
