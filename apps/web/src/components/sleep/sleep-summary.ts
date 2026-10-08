import type { SleepDailyEntry } from "@bessel/client";

const HOUR = 3600;

// Nights are bucketed noon-to-noon (matches the backend's wake-date
// attribution), so the window for a selected date runs from noon the day
// before to noon on the date itself.
export function localNightBounds(d: Date): [number, number] {
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12);
  return [Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000)];
}

/** A warm one-liner for how long a night was. */
export function nightMood(asleepSecs: number): string {
  if (asleepSecs >= 7.5 * HOUR) return "a cosy night ✨";
  if (asleepSecs >= 6.5 * HOUR) return "a solid night";
  if (asleepSecs >= 5 * HOUR)
    return "a bit short - be gentle with yourself today";
  return "a short night - maybe an early one tonight? 🌙";
}

/**
 * Minutes since 18:00 of the bed evening for a local ISO time like
 * "2026-10-03T23:40:00+02:00", so bedtimes either side of midnight compare
 * on one axis (23:40 → 340, 00:30 → 390, 07:10 → 790).
 */
export function eveningMinutes(iso: string): number | null {
  const m = /T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return (minutes - 18 * 60 + 24 * 60) % (24 * 60);
}

/** "11:40pm" for minutes since 18:00. */
export function formatEveningClock(minutes: number): string {
  const total = (Math.round(minutes) + 18 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export interface RhythmStats {
  nights: number;
  avgAsleepSecs: number | null;
  avgBedtime: number | null;
  avgWake: number | null;
  /** Average distance of each bedtime from the usual one, in minutes. */
  bedtimeSpread: number | null;
}

function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function rhythmStats(nights: SleepDailyEntry[]): RhythmStats {
  const slept = nights.filter((n) => n.asleep_secs > 0);
  const bedtimes = slept
    .map((n) => (n.sleep_onset ? eveningMinutes(n.sleep_onset) : null))
    .filter((x): x is number => x !== null);
  const wakes = slept
    .map((n) => (n.wake_time ? eveningMinutes(n.wake_time) : null))
    .filter((x): x is number => x !== null);
  const avgBedtime = mean(bedtimes);
  return {
    nights: slept.length,
    avgAsleepSecs: mean(slept.map((n) => n.asleep_secs)),
    avgBedtime,
    avgWake: mean(wakes),
    bedtimeSpread:
      avgBedtime === null
        ? null
        : mean(bedtimes.map((b) => Math.abs(b - avgBedtime))),
  };
}

/** "+25m vs your usual", "about your usual", "-1h 10m vs your usual". */
export function compareToUsual(
  secs: number,
  usualSecs: number | null,
): string | null {
  if (usualSecs === null) return null;
  const diffMin = Math.round((secs - usualSecs) / 60);
  if (Math.abs(diffMin) < 10) return "about your usual";
  const abs = Math.abs(diffMin);
  const text = abs >= 60 ? `${Math.floor(abs / 60)}h ${abs % 60}m` : `${abs}m`;
  return `${diffMin > 0 ? "+" : "-"}${text} vs your usual`;
}

/** How steady bedtimes are, in friendly words. */
export function consistencyLabel(spreadMin: number | null): string | null {
  if (spreadMin === null) return null;
  if (spreadMin <= 20) return "Very steady bedtimes";
  if (spreadMin <= 45) return "Fairly steady bedtimes";
  return "Bedtimes move around a bit";
}
