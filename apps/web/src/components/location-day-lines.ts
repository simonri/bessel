import type {
  LocationActivity,
  LocationPoint,
  LocationVisit,
} from "@bessel/client";

export type LatLng = [number, number];

export type TripLine = {
  id: string;
  points: LatLng[];
  /** False when the phone recorded no route and the line is a guess. */
  recorded: boolean;
  mode: "walk" | "ride" | "flight";
};

/** A stay or trip this close to a trip's ends is where it starts or stops. */
const JOIN_SECONDS = 15 * 60;

const WALKING = new Set(["walking", "running", "hiking", "on foot"]);

function mode(activityType: string | null): TripLine["mode"] {
  if (activityType === "flying") return "flight";
  return activityType && WALKING.has(activityType) ? "walk" : "ride";
}

function seconds(at: Date): number {
  return at.getTime() / 1000;
}

function coordinates(
  latitude: number | null,
  longitude: number | null,
): LatLng | null {
  return latitude != null && longitude != null ? [latitude, longitude] : null;
}

function closest<T>(items: T[], distance: (item: T) => number): T | null {
  let best: T | null = null;
  let bestDistance = JOIN_SECONDS;
  for (const item of items) {
    const d = distance(item);
    if (d <= bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}

/**
 * Each trip as one line that runs from the place it left to the place it
 * reached, through the route the phone recorded, the way Google Maps draws a
 * day. Google's own trip ends are often off from both the places and the
 * route (by hundreds of metres, sometimes kilometres), so they're used only
 * when there's nothing better.
 */
export function tripLines(
  visits: LocationVisit[],
  activities: LocationActivity[],
  path: LocationPoint[],
): TripLine[] {
  const stays = visits
    .filter((v) => v.hierarchy_level === 0)
    .map((v) => ({
      start: seconds(v.start_at),
      end: seconds(v.end_at),
      at: coordinates(v.latitude, v.longitude),
    }))
    .filter((v): v is { start: number; end: number; at: LatLng } => !!v.at);
  const trips = [...activities].sort(
    (a, b) => a.start_at.getTime() - b.start_at.getTime(),
  );

  const lines: TripLine[] = [];
  let previous: { end: number; last: LatLng } | null = null;
  for (const trip of trips) {
    const start = seconds(trip.start_at);
    const end = seconds(trip.end_at);
    const route = path
      .filter((p) => p.ts >= start && p.ts <= end)
      .map((p): LatLng => [p.latitude, p.longitude]);

    // Picks up where the trip before ended: a walk straight into a bus, or a
    // trip that ended at the stay this one leaves from.
    const head =
      (previous && start - previous.end <= JOIN_SECONDS
        ? previous.last
        : null) ??
      closest(stays, (s) => Math.abs(s.end - start))?.at ??
      (route.length === 0
        ? coordinates(trip.start_latitude, trip.start_longitude)
        : null);
    const tail =
      closest(stays, (s) => Math.abs(s.start - end))?.at ??
      (route.length === 0
        ? coordinates(trip.end_latitude, trip.end_longitude)
        : null);

    const points: LatLng[] = [];
    for (const p of [head, ...route, tail]) {
      const last = points[points.length - 1];
      if (p && !(last && last[0] === p[0] && last[1] === p[1])) points.push(p);
    }
    if (points.length < 2) continue;
    lines.push({
      id: trip.id,
      points,
      recorded: route.length > 0,
      mode: mode(trip.activity_type),
    });
    previous = { end, last: points[points.length - 1] };
  }
  return lines;
}
