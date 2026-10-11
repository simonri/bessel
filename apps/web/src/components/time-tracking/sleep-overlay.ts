import type { TimelineSegment } from "@bessel/client";

const ASLEEP = new Set([
  "asleepCore",
  "asleepDeep",
  "asleepREM",
  "asleepUnspecified",
]);
/** Awake stretches shorter than this stay inside one night. */
const JOIN_GAP_SECS = 30 * 60;

export interface SleepBand {
  /** Unix seconds. */
  start: number;
  end: number;
  asleepSecs: number;
}

/** A timeline sleep lane as whole sleeps: stages joined across short wake-ups. */
export function sleepBands(segments: TimelineSegment[]): SleepBand[] {
  const asleep = segments
    .filter((s) => ASLEEP.has(s.label) && s.end_ts > s.start_ts)
    .sort((a, b) => a.start_ts - b.start_ts);
  const bands: SleepBand[] = [];
  for (const s of asleep) {
    const last = bands.at(-1);
    if (last && s.start_ts - last.end <= JOIN_GAP_SECS) {
      last.asleepSecs += Math.max(0, s.end_ts - Math.max(s.start_ts, last.end));
      last.end = Math.max(last.end, s.end_ts);
    } else {
      bands.push({
        start: s.start_ts,
        end: s.end_ts,
        asleepSecs: s.end_ts - s.start_ts,
      });
    }
  }
  return bands;
}
