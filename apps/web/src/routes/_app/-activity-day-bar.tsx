import { useState } from "react";
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
        <div
          className="relative flex w-full overflow-hidden rounded"
          style={{ height: "18px", background: "rgba(255,255,255,0.06)" }}
        >
          {Array.from({ length: n }, (_, i) =>
            activeSet.has(i) ? (
              <div
                key={i}
                className="absolute inset-y-0"
                style={{
                  left: `${(i / n) * 100}%`,
                  width: `${(1 / n) * 100}%`,
                  background: "rgba(96,165,250,0.75)",
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
            className="pointer-events-none absolute bottom-full mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white/80"
            style={{
              left: `${((hoveredSegment.start + hoveredSegment.end) / 2 / n) * 100}%`,
            }}
          >
            {fmtBucketTime(hoveredSegment.start, n)} –{" "}
            {fmtBucketTime(hoveredSegment.end, n)}
          </div>
        )}
      </div>
      <div className="relative mt-1 select-none" style={{ height: "14px" }}>
        {DAY_LABELS.map(({ label, pct }) => (
          <span
            key={label + pct}
            className="absolute text-[10px] leading-none text-white/30"
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
