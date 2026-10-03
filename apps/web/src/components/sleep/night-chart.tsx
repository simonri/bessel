import type { TimelineSegment } from "@bessel/client";
import { format } from "date-fns";
import { fmtDur } from "@/routes/_app/-activity-utils";
import { STAGE_META } from "@/routes/_app/-sleep-utils";

// Hypnogram rows, lightest sleep on top like Apple Health and most trackers.
const ROWS = [
  { key: "awake", stages: ["awake"] },
  { key: "asleepREM", stages: ["asleepREM"] },
  { key: "asleepCore", stages: ["asleepCore", "asleepUnspecified"] },
  { key: "asleepDeep", stages: ["asleepDeep"] },
] as const;

const HALF_HOUR = 1800;

function clock(ts: number): string {
  return format(new Date(ts * 1000), "h a")
    .toLowerCase()
    .replace(" ", "");
}

/** The night as stage lanes over time. */
export function NightChart({ segments }: { segments: TimelineSegment[] }) {
  if (segments.length === 0) return null;
  const first = Math.min(...segments.map((s) => s.start_ts));
  const last = Math.max(...segments.map((s) => s.end_ts));
  const start = Math.floor(first / HALF_HOUR) * HALF_HOUR;
  const end = Math.ceil(last / HALF_HOUR) * HALF_HOUR;
  const span = end - start;
  const pct = (ts: number) => ((ts - start) / span) * 100;

  const hours: number[] = [];
  const firstHour = Math.ceil(start / 3600) * 3600;
  const step = span > 10 * 3600 ? 7200 : 3600;
  for (let t = firstHour; t <= end; t += step) hours.push(t);

  return (
    <div className="flex flex-col gap-2">
      {ROWS.map((row) => {
        const meta = STAGE_META[row.key];
        const blocks = segments.filter((s) =>
          (row.stages as readonly string[]).includes(s.label),
        );
        return (
          <div key={row.key} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-11 font-medium text-white/45">
              {meta.label}
            </span>
            <div className="relative h-6 flex-1 rounded-full bg-white/[0.03]">
              {blocks.map((b) => (
                <span
                  key={`${b.start_ts}-${b.label}`}
                  title={`${meta.label} - ${format(new Date(b.start_ts * 1000), "h:mma").toLowerCase()} for ${fmtDur(b.end_ts - b.start_ts)}`}
                  className="absolute inset-y-1 min-w-1 rounded-full transition-opacity duration-150 hover:opacity-80"
                  style={{
                    left: `${pct(b.start_ts)}%`,
                    width: `${pct(b.end_ts) - pct(b.start_ts)}%`,
                    backgroundColor: meta.color,
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}
      <div className="relative ml-15 h-4">
        {hours.map((t) => (
          <span
            key={t}
            className="absolute -translate-x-1/2 text-10 tabular-nums text-white/35"
            style={{ left: `${pct(t)}%` }}
          >
            {clock(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
