import type {
  LocationVisit,
  TimelineLane,
  TimelineLaneKey,
} from "@bessel/client";
import { projectHue } from "@/components/tasks/project-colors";

export type RibbonLaneKey = TimelineLaneKey | "places";

export interface RibbonBlock {
  startTs: number;
  endTs: number;
  /** Shown on hover, and inside the block when it's wide enough. */
  name: string;
  /** oklch hue of the block's pastel. */
  hue: number;
}

export interface RibbonLane {
  key: RibbonLaneKey;
  title: string;
  totalSecs: number;
  blocks: RibbonBlock[];
}

export const LANE_META: Record<RibbonLaneKey, { title: string; hue: number }> =
  {
    sleep: { title: "Sleep", hue: 295 },
    pc: { title: "Screen time", hue: 235 },
    places: { title: "Places", hue: 165 },
  };

// Segments closer than a minute apart are one session, whatever sleep stage
// or app class they were.
const MERGE_GAP_SECS = 60;

export function mergeSessions(
  lane: TimelineLane,
): { startTs: number; endTs: number }[] {
  const sessions: { startTs: number; endTs: number }[] = [];
  for (const s of [...lane.segments].sort((a, b) => a.start_ts - b.start_ts)) {
    const last = sessions.at(-1);
    if (last && s.start_ts - last.endTs <= MERGE_GAP_SECS) {
      last.endTs = Math.max(last.endTs, s.end_ts);
    } else {
      sessions.push({ startTs: s.start_ts, endTs: s.end_ts });
    }
  }
  return sessions;
}

export function activityLane(lane: TimelineLane): RibbonLane {
  const { title, hue } = LANE_META[lane.key];
  return {
    key: lane.key,
    title,
    totalSecs: lane.total_secs,
    blocks: mergeSessions(lane).map((s) => ({ ...s, name: title, hue })),
  };
}

function toTs(value: Date | string): number {
  return Math.floor(new Date(value).getTime() / 1000);
}

export function visitName(visit: LocationVisit): string {
  if (visit.name) return visit.name;
  const semantic = (visit.semantic_type ?? "").toLowerCase();
  if (semantic.includes("home")) return "Home";
  if (semantic.includes("work")) return "Work";
  return "Somewhere";
}

/** Visits clipped to the day, each place in its own pastel. */
export function placesLane(
  visits: readonly LocationVisit[],
  startTs: number,
  endTs: number,
): RibbonLane {
  const blocks = visits
    .map((v) => ({
      startTs: Math.max(startTs, toTs(v.start_at)),
      endTs: Math.min(endTs, toTs(v.end_at)),
      name: visitName(v),
    }))
    .filter((b) => b.endTs > b.startTs)
    .sort((a, b) => a.startTs - b.startTs)
    .map((b) => ({ ...b, hue: projectHue(b.name) }));
  return {
    key: "places",
    title: LANE_META.places.title,
    totalSecs: blocks.reduce((t, b) => t + b.endTs - b.startTs, 0),
    blocks,
  };
}

export interface Moment {
  ts: number;
  kind: "sleep" | "wake" | "screen" | "place";
  text: string;
  /** Extra context, e.g. how long it lasted. */
  detail?: string;
}

/**
 * The day as a short story: falling asleep and waking up, sitting down at
 * the computer, arriving somewhere. Ordered by time.
 */
export function dayMoments(
  lanes: readonly RibbonLane[],
  startTs: number,
  endTs: number,
  formatDuration: (secs: number) => string,
): Moment[] {
  const moments: Moment[] = [];
  for (const lane of lanes) {
    for (const b of lane.blocks) {
      const length = formatDuration(b.endTs - b.startTs);
      if (lane.key === "sleep") {
        // A night that started yesterday only shows its waking up.
        if (b.startTs > startTs)
          moments.push({ ts: b.startTs, kind: "sleep", text: "Fell asleep" });
        if (b.endTs < endTs)
          moments.push({
            ts: b.endTs,
            kind: "wake",
            text: "Woke up",
            detail: `after ${length}`,
          });
      } else if (lane.key === "pc") {
        moments.push({
          ts: b.startTs,
          kind: "screen",
          text: "At the computer",
          detail: length,
        });
      } else if (b.startTs > startTs) {
        moments.push({
          ts: b.startTs,
          kind: "place",
          text: b.name,
          detail: length,
        });
      }
    }
  }
  return moments.sort((a, b) => a.ts - b.ts);
}

/** Sleep that ended during the day: when you went to bed and woke up. */
export function nightOf(lane: RibbonLane | undefined): {
  bedTs: number;
  wakeTs: number;
} | null {
  if (!lane || lane.blocks.length === 0) return null;
  const longest = [...lane.blocks].sort(
    (a, b) => b.endTs - b.startTs - (a.endTs - a.startTs),
  )[0];
  return { bedTs: longest.startTs, wakeTs: longest.endTs };
}

export function longestBlockSecs(lane: RibbonLane | undefined): number {
  if (!lane) return 0;
  return lane.blocks.reduce((m, b) => Math.max(m, b.endTs - b.startTs), 0);
}

export function uniquePlaces(lane: RibbonLane | undefined): string[] {
  if (!lane) return [];
  return [...new Set(lane.blocks.map((b) => b.name))];
}

/** "You slept 6h 30m, spent 5h 40m at the computer and visited 3 places." */
export function daySentence(
  lanes: readonly RibbonLane[],
  formatDuration: (secs: number) => string,
): string | null {
  const parts: string[] = [];
  const lane = (key: RibbonLane["key"]) =>
    lanes.find((l) => l.key === key && l.blocks.length > 0);
  const sleep = lane("sleep");
  const screen = lane("pc");
  const places = lane("places");
  if (sleep) parts.push(`slept ${formatDuration(sleep.totalSecs)}`);
  if (screen)
    parts.push(`spent ${formatDuration(screen.totalSecs)} at the computer`);
  if (places) {
    const n = new Set(places.blocks.map((b) => b.name)).size;
    parts.push(`visited ${n} ${n === 1 ? "place" : "places"}`);
  }
  if (parts.length === 0) return null;
  const last = parts.pop();
  return `You ${parts.length ? `${parts.join(", ")} and ${last}` : last}.`;
}
