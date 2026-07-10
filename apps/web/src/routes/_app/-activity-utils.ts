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
