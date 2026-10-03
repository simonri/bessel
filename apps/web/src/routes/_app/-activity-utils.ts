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
