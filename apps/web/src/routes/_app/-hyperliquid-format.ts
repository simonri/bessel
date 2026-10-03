import type { Range } from "@/lib/hyperliquid";

export const RANGE_LABELS: Record<Range, { short: string; long: string }> = {
  day: { short: "24H", long: "24h" },
  week: { short: "7D", long: "7 days" },
  month: { short: "30D", long: "30 days" },
  allTime: { short: "All", long: "all time" },
};

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatUsd(value: number): string {
  return usd.format(value);
}

/** "+$1,201.67" / "-$40.00": the sign carries direction, not only color. */
export function formatSignedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${usd.format(Math.abs(value))}`;
}

/** Large amounts compacted ("$21.3M"), small ones exact. */
export function formatVolume(value: number): string {
  return value >= 100_000 ? compactUsd.format(value) : usd.format(value);
}

const wholeUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** 1, 2, 2.5 or 5 × 10ⁿ: the smallest of those at least `rough`. */
function niceStep(rough: number): number {
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].find((m) => m * power >= rough) ?? 10;
  return step * power;
}

export interface ValueAxis {
  domain: [number, number];
  ticks: number[];
}

/** Y-axis on round steps covering the values (and zero, so gains and
 *  losses read against it), never zero-height: a flat line would otherwise
 *  stack every tick on one value. */
export function valueAxis(values: number[], tickCount = 5): ValueAxis {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = Math.max(
    max - min,
    Math.max(Math.abs(min), Math.abs(max)) * 0.01,
    1,
  );
  const step = niceStep(span / (tickCount - 1));
  // A line within a tenth of a step of an edge gets another step of air;
  // zero itself is a fine edge.
  let low = Math.floor(min / step) * step;
  if (min < 0 && min - low < step / 10) low -= step;
  let high = Math.ceil(max / step) * step;
  if (max > 0 && high - max < step / 10) high += step;
  if (high === low) high = low + step;
  const count = Math.round((high - low) / step);
  // Built from the index, not by adding: repeated float additions drift.
  const ticks = Array.from({ length: count + 1 }, (_, i) =>
    Number((low + i * step).toFixed(10)),
  );
  return { domain: [low, high], ticks };
}

/** Compact ("$36.5K") when steps are in thousands; whole dollars when
 *  smaller, so neighbouring ticks never read the same. */
export function axisUsdFormatter(ticks: number[]): (value: number) => string {
  const step = ticks.length > 1 ? ticks[1] - ticks[0] : 1;
  if (step < 1) return (v) => usd.format(v);
  if (step < 100) return (v) => wholeUsd.format(v);
  return (v) => compactUsd.format(v);
}

/** Prices keep the precision they need: BTC in dollars, small caps in cents. */
export function formatPrice(value: number): string {
  const digits = value >= 1000 ? 1 : value >= 1 ? 3 : 6;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(digits, 2),
    maximumFractionDigits: digits,
  });
}

export function formatAmount(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: Math.abs(value) >= 1 ? 4 : 8,
  });
}

export function formatPercent(fraction: number): string {
  const sign = fraction > 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(2)}%`;
}

/** Axis and tooltip labels sized to the range: hours for a day, dates beyond. */
export function formatTime(ts: number, range: Range, detailed = false): string {
  const date = new Date(ts);
  if (range === "day") {
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: range === "allTime" ? "numeric" : undefined,
    hour: detailed ? "2-digit" : undefined,
    minute: detailed ? "2-digit" : undefined,
    hour12: detailed ? false : undefined,
  });
}

/** Axis label for a tick from `timeTicks`. */
export function formatTick(ts: number, range: Range): string {
  const date = new Date(ts);
  if (range === "day") return formatTime(ts, range);
  if (range === "allTime") {
    return date.toLocaleDateString(undefined, {
      month: "short",
      year: "numeric",
    });
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const HOUR = 3_600_000;

/** Axis ticks on calendar boundaries, so no two share a label: every 3 hours
 *  for a day, midnights for a week, every 5th midnight for a month, and
 *  month starts (spaced to at most ~8) for all time. */
export function timeTicks(start: number, end: number, range: Range): number[] {
  const ticks: number[] = [];
  const cursor = new Date(start);
  if (range === "day") {
    cursor.setMinutes(0, 0, 0);
    cursor.setHours(Math.ceil(cursor.getHours() / 3) * 3);
    for (let t = cursor.getTime(); t <= end; t += 3 * HOUR) {
      if (t >= start) ticks.push(t);
    }
    return ticks;
  }
  if (range === "allTime") {
    const months =
      (new Date(end).getFullYear() - cursor.getFullYear()) * 12 +
      new Date(end).getMonth() -
      cursor.getMonth();
    const step = Math.max(1, Math.ceil(months / 8));
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    cursor.setMonth(cursor.getMonth() + 1);
    while (cursor.getTime() <= end) {
      ticks.push(cursor.getTime());
      cursor.setMonth(cursor.getMonth() + step);
    }
    return ticks;
  }
  const step = range === "week" ? 1 : 5;
  cursor.setHours(0, 0, 0, 0);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor.getTime() <= end) {
    ticks.push(cursor.getTime());
    cursor.setDate(cursor.getDate() + step);
  }
  return ticks;
}

/** Text tone for a signed amount. */
export function pnlTone(value: number | null): string {
  if (!value) return "text-white/90";
  return value > 0 ? "text-emerald-400" : "text-red-400";
}
