import type { SleepDailyEntry } from "@bessel/client";
import { format, isSameDay } from "date-fns";
import { cn } from "@/lib/utils";
import { fmtDur } from "@/routes/_app/-activity-utils";
import { eveningMinutes, formatEveningClock } from "./sleep-summary";

// Never squeeze the axis tighter than 10pm → 8am, so a regular week doesn't
// fill the chart edge to edge.
const AXIS_MIN = 4 * 60;
const AXIS_MAX = 14 * 60;
const PAD = 30;

function dateKey(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * Each night as a pill from falling asleep to waking up, on one clock axis,
 * so the rhythm (and the odd late night) is visible at a glance.
 */
export function RhythmChart({
  days,
  nights,
  selected,
  avgBedtime,
  avgWake,
  onSelect,
}: {
  days: Date[];
  nights: SleepDailyEntry[];
  selected: Date;
  avgBedtime: number | null;
  avgWake: number | null;
  onSelect: (d: Date) => void;
}) {
  const byDate = new Map(nights.map((n) => [n.date, n]));
  const spans = days.map((d) => {
    const n = byDate.get(dateKey(d));
    const bed = n?.sleep_onset ? eveningMinutes(n.sleep_onset) : null;
    const wake = n?.wake_time ? eveningMinutes(n.wake_time) : null;
    return { d, n, bed, wake };
  });
  const lo = Math.min(AXIS_MIN, ...spans.map((s) => s.bed ?? AXIS_MIN)) - PAD;
  const hi = Math.max(AXIS_MAX, ...spans.map((s) => s.wake ?? AXIS_MAX)) + PAD;
  const pct = (m: number) => ((m - lo) / (hi - lo)) * 100;

  return (
    <div className="flex gap-3">
      <div className="relative h-44 w-14 shrink-0 text-right text-10 tabular-nums text-white/35">
        {avgBedtime !== null && (
          <span
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${pct(avgBedtime)}%` }}
          >
            {formatEveningClock(avgBedtime)}
          </span>
        )}
        {avgWake !== null && (
          <span
            className="absolute right-0 -translate-y-1/2"
            style={{ top: `${pct(avgWake)}%` }}
          >
            {formatEveningClock(avgWake)}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="relative h-44">
          {[avgBedtime, avgWake].map(
            (m, i) =>
              m !== null && (
                <span
                  key={i === 0 ? "bed" : "wake"}
                  aria-hidden
                  className="absolute inset-x-0 border-t border-dashed border-white/10"
                  style={{ top: `${pct(m)}%` }}
                />
              ),
          )}
          <div className="absolute inset-0 flex">
            {spans.map(({ d, n, bed, wake }) => {
              const active = isSameDay(d, selected);
              const label = n
                ? `${format(d, "EEE d MMM")}: ${fmtDur(n.asleep_secs)}${bed !== null && wake !== null ? `, ${formatEveningClock(bed)} to ${formatEveningClock(wake)}` : ""}`
                : `${format(d, "EEE d MMM")}: no sleep recorded`;
              return (
                <button
                  key={dateKey(d)}
                  type="button"
                  onClick={() => onSelect(d)}
                  title={label}
                  aria-label={label}
                  aria-pressed={active}
                  className={cn(
                    "group relative flex-1 rounded-lg transition-colors duration-150 hover:bg-white/[0.04]",
                    active && "bg-white/[0.05]",
                  )}
                >
                  {bed !== null && wake !== null ? (
                    <span
                      className={cn(
                        "absolute left-1/2 w-2 -translate-x-1/2 rounded-full transition-[background-color,width] duration-200 group-hover:w-2.5",
                        active
                          ? "w-2.5 bg-primary-400"
                          : "bg-[oklch(0.78_0.09_290)]",
                      )}
                      style={{
                        top: `${pct(bed)}%`,
                        height: `${Math.max(2, pct(wake) - pct(bed))}%`,
                      }}
                    />
                  ) : (
                    <span className="absolute top-1/2 left-1/2 size-1 -translate-x-1/2 rounded-full bg-white/15" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex">
          {spans.map(({ d }) => {
            const active = isSameDay(d, selected);
            return (
              <span
                key={dateKey(d)}
                className={cn(
                  "flex flex-1 flex-col items-center text-10 leading-tight tabular-nums",
                  active ? "font-semibold text-white/85" : "text-white/35",
                )}
              >
                <span>{format(d, "EEEEE")}</span>
                <span>{format(d, "d")}</span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
