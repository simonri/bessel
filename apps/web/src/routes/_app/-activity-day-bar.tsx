import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmtBucketTime } from "./-activity-utils";

const DAY_LABELS: { label: string; pct: number }[] = [
  { label: "12am", pct: 0 },
  { label: "3am", pct: 12.5 },
  { label: "6am", pct: 25 },
  { label: "9am", pct: 37.5 },
  { label: "12pm", pct: 50 },
  { label: "3pm", pct: 62.5 },
  { label: "6pm", pct: 75 },
  { label: "9pm", pct: 87.5 },
  { label: "12am", pct: 100 },
];

export function ActivityDayBar({
  buckets,
  totalBuckets,
}: {
  buckets: { bucket: number; active_secs: number }[];
  totalBuckets: number;
}) {
  const [hoveredBucket, setHoveredBucket] = useState<number | null>(null);
  const activeSet = new Set(buckets.map((b) => b.bucket));
  const n = totalBuckets || 96;

  // Build contiguous segments and a per-bucket lookup
  const segments: { start: number; end: number }[] = [];
  for (const b of [...activeSet].sort((a, z) => a - z)) {
    const last = segments[segments.length - 1];
    if (last && last.end === b) {
      last.end = b + 1;
    } else {
      segments.push({ start: b, end: b + 1 });
    }
  }
  const bucketToSegment = new Map<number, { start: number; end: number }>();
  for (const seg of segments) {
    for (let i = seg.start; i < seg.end; i++) bucketToSegment.set(i, seg);
  }

  const hoveredSegment =
    hoveredBucket !== null
      ? (bucketToSegment.get(hoveredBucket) ?? null)
      : null;

  return (
    <div>
      <div className="relative">
        <div className="relative flex h-5 w-full overflow-hidden rounded-md bg-white/[0.06]">
          {[25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="absolute inset-y-0 w-px bg-white/[0.06]"
              style={{ left: `${pct}%` }}
            />
          ))}
          {Array.from({ length: n }, (_, i) =>
            activeSet.has(i) ? (
              <div
                key={i}
                className={cn(
                  "absolute inset-y-0 transition-colors duration-150",
                  hoveredSegment &&
                    i >= hoveredSegment.start &&
                    i < hoveredSegment.end
                    ? "bg-primary-400"
                    : "bg-primary-500/75",
                )}
                style={{
                  left: `${(i / n) * 100}%`,
                  width: `${(1 / n) * 100}%`,
                }}
              />
            ) : null,
          )}
          <div
            className="absolute inset-0"
            onMouseMove={(e) => {
              const pct = e.nativeEvent.offsetX / e.currentTarget.offsetWidth;
              setHoveredBucket(Math.min(Math.floor(pct * n), n - 1));
            }}
            onMouseLeave={() => setHoveredBucket(null)}
          />
        </div>

        {hoveredSegment !== null && (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-popover px-2 py-1 text-11 tabular-nums text-white/85 shadow-lg"
            style={{
              left: `${((hoveredSegment.start + hoveredSegment.end) / 2 / n) * 100}%`,
            }}
          >
            {fmtBucketTime(hoveredSegment.start, n)} –{" "}
            {fmtBucketTime(hoveredSegment.end, n)}
          </div>
        )}
      </div>
      <div className="relative mt-1.5 h-3 select-none">
        {DAY_LABELS.map(({ label, pct }) => (
          <span
            key={label + pct}
            className="absolute text-10 leading-none tabular-nums text-white/35"
            style={{
              left: `${pct}%`,
              transform:
                pct === 0
                  ? "none"
                  : pct === 100
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
