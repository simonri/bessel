// Indexed colors for app bars (per app, by position)
export const APP_COLORS = [
  "232 113 75", // warm orange
  "147 131 250", // soft violet
  "96 165 250", // sky blue
  "52 211 153", // emerald
  "251 191 36", // amber
  "244 114 182", // rose pink
  "34 211 238", // cyan
  "192 132 252", // lavender
  "251 146 60", // peach
  "74 222 128", // lime
];

export function activityLevel(
  secs: number,
  maxSecs: number,
): 0 | 1 | 2 | 3 | 4 {
  if (secs === 0 || maxSecs === 0) return 0;
  const r = secs / maxSecs;
  if (r < 0.25) return 1;
  if (r < 0.5) return 2;
  if (r < 0.75) return 3;
  return 4;
}

export function localDayBounds(d: Date): [number, number] {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return [Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000)];
}

export function fmtDur(secs: number): string {
  const m = Math.floor(secs / 60);
  if (m >= 60)
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}m`;
}

export function fmtBucketTime(bucketIdx: number, n: number): string {
  const totalMins = Math.round(bucketIdx * ((24 * 60) / n)) % (24 * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}
