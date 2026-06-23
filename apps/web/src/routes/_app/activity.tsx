import { useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isSameDay, format, subDays, addDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  listActivitySourcesV1ActivitySourcesGetOptions,
  getActivitySummaryV1ActivitySummaryGetOptions,
  getDailyActivityV1ActivityDailyGetOptions,
  getIntradayActivityV1ActivityIntradayGetOptions,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@metron/ui/components/select";
import { Skeleton } from "@metron/ui/components/skeleton";
import { client } from "@/lib/client";
import { useSettings } from "@/hooks/use-settings";

export const Route = createFileRoute("/_app/activity")({
  component: ActivityPage,
});

// Indexed colors for app bars (per app, by position)
const APP_COLORS = [
  "232,113,75",   // warm orange
  "147,131,250",  // soft violet
  "96,165,250",   // sky blue
  "52,211,153",   // emerald
  "251,191,36",   // amber
  "244,114,182",  // rose pink
  "34,211,238",   // cyan
  "192,132,252",  // lavender
  "251,146,60",   // peach
  "74,222,128",   // lime
];

// 5 intensity levels for the year grid (GitHub-style)
const GRID_ALPHA = [0.07, 0.28, 0.50, 0.72, 0.92];

function activityLevel(secs: number, maxSecs: number): 0 | 1 | 2 | 3 | 4 {
  if (secs === 0 || maxSecs === 0) return 0;
  const r = secs / maxSecs;
  if (r < 0.25) return 1;
  if (r < 0.50) return 2;
  if (r < 0.75) return 3;
  return 4;
}

function localDayBounds(d: Date): [number, number] {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return [Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000)];
}

function fmtDur(secs: number): string {
  const m = Math.floor(secs / 60);
  if (m >= 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${m}m`;
}

type GridDay = { d: Date; dateStr: string; active_secs: number } | null;

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

function fmtBucketTime(bucketIdx: number, n: number): string {
  const totalMins = Math.round(bucketIdx * ((24 * 60) / n)) % (24 * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function ActivityDayBar({
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

  const hoveredSegment = hoveredBucket !== null ? (bucketToSegment.get(hoveredBucket) ?? null) : null;

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
            ) : null
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
            style={{ left: `${((hoveredSegment.start + hoveredSegment.end) / 2 / n) * 100}%` }}
          >
            {fmtBucketTime(hoveredSegment.start, n)} – {fmtBucketTime(hoveredSegment.end, n)}
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
              transform: pct === 0 ? "none" : pct === 100 ? "translateX(-100%)" : "translateX(-50%)",
            }}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function GridCell({
  day,
  col,
  row,
  isSelected,
  isToday,
  maxYearSecs,
  onClick,
}: {
  day: NonNullable<GridDay>;
  col: number;
  row: number;
  isSelected: boolean;
  isToday: boolean;
  maxYearSecs: number;
  onClick: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    timer.current = setTimeout(() => setVisible(true), 800);
  };

  const handleMouseLeave = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  };

  return (
    <button
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative aspect-square rounded-[2px] transition-all cursor-pointer ${
        isSelected
          ? "ring-1 ring-inset ring-white/60"
          : isToday
            ? "ring-1 ring-inset ring-white/25"
            : ""
      }`}
      style={{
        gridColumn: col,
        gridRow: row,
        background: `rgba(232,113,75,${GRID_ALPHA[activityLevel(day.active_secs, maxYearSecs)]})`,
      }}
    >
      {visible && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white/80">
          <span className="text-white/50">{format(day.d, "MMM d")} · </span>
          {day.active_secs > 0 ? fmtDur(day.active_secs) : "No activity"}
        </div>
      )}
    </button>
  );
}

export function ActivityPage() {
  const today = new Date();
  const [date, setDate] = useState(today);
  const [source, setSource] = useState<string | null>(null);
  const { settings } = useSettings();

  const mapName = (name: string) => {
    const match = settings.activityMappings.find((m) => m.from && m.from === name);
    return match?.to || name;
  };

  const isCurrentDay = isSameDay(date, today);

  const { data: sourcesData } = useQuery({
    ...listActivitySourcesV1ActivitySourcesGetOptions({ client }),
  });
  const sources = sourcesData?.sources ?? [];
  const activeSource = source ?? sources[0] ?? null;

  // Daily detail for selected date
  const [startTs, endTs] = localDayBounds(date);
  const { data: summary, isLoading } = useQuery({
    ...getActivitySummaryV1ActivitySummaryGetOptions({
      client,
      query: { start_ts: startTs, end_ts: endTs, source: activeSource! },
    }),
    enabled: !!activeSource,
    placeholderData: keepPreviousData,
  });

  const { data: intradayData } = useQuery({
    ...getIntradayActivityV1ActivityIntradayGetOptions({
      client,
      query: { start_ts: startTs, end_ts: endTs, source: activeSource!, bucket_mins: 15 },
    }),
    enabled: !!activeSource,
    placeholderData: keepPreviousData,
  });

  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Full calendar year grid: Jan 1 → Dec 31, padded to week boundaries
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const calYearStart = new Date(today.getFullYear(), 0, 1);
  const yearGridStart = subDays(calYearStart, calYearStart.getDay()); // Sunday on/before Jan 1
  const calYearEnd = new Date(today.getFullYear(), 11, 31);
  const yearGridEnd = addDays(calYearEnd, 6 - calYearEnd.getDay()); // Saturday on/after Dec 31
  const yearRangeStart = Math.floor(yearGridStart.getTime() / 1000);
  const yearRangeEnd = Math.floor(
    new Date(todayMidnight.getFullYear(), todayMidnight.getMonth(), todayMidnight.getDate() + 1).getTime() / 1000
  );

  const { data: yearDailyData } = useQuery({
    ...getDailyActivityV1ActivityDailyGetOptions({
      client,
      query: { start_ts: yearRangeStart, end_ts: yearRangeEnd, source: activeSource!, tz_name: tzName },
    }),
    enabled: !!activeSource,
  });

  const yearDailyMap = new Map(yearDailyData?.days.map((d) => [d.date, d.active_secs]) ?? []);
  const maxYearSecs = Math.max(...(yearDailyData?.days.map((d) => d.active_secs) ?? []), 1);

  // Build week columns: full calendar year, future dates are null (empty cells)
  const yearGrid: GridDay[][] = [];
  let ws = new Date(yearGridStart);
  while (ws <= yearGridEnd) {
    const week: GridDay[] = [];
    for (let di = 0; di < 7; di++) {
      const d = addDays(ws, di);
      if (d.getFullYear() !== today.getFullYear()) {
        week.push(null); // padding days outside the calendar year
      } else {
        const dateStr = format(d, "yyyy-MM-dd");
        week.push({ d, dateStr, active_secs: yearDailyMap.get(dateStr) ?? 0 });
      }
    }
    yearGrid.push(week);
    ws = addDays(ws, 7);
  }

  // Month labels: show at the column where a new month starts
  const monthMarkers: { col: number; label: string }[] = [];
  let prevMonth = -1;
  yearGrid.forEach((week, wi) => {
    const first = week.find((d) => d !== null);
    if (!first) return;
    const m = first.d.getMonth();
    if (m !== prevMonth) {
      monthMarkers.push({ col: wi, label: format(first.d, "MMM") });
      prevMonth = m;
    }
  });

  const prevDay = () => setDate((d) => subDays(d, 1));
  const nextDay = () => setDate((d) => addDays(d, 1));
  const goToday = () => setDate(today);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Time tracking from the desktop monitor.
          </p>
        </div>
        {sources.length > 1 && (
          <Select value={activeSource ?? ""} onValueChange={(v) => setSource(v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select machine" />
            </SelectTrigger>
            <SelectContent>
              {sources.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!sourcesData ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No data yet. Run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            ./main.py --push
          </code>{" "}
          in{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
            services/monitor
          </code>{" "}
          to sync your activity history.
        </p>
      ) : (
        <>
          {/* Date navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevDay}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-36 text-center text-sm font-medium">
              {isCurrentDay ? "Today" : format(date, "EEE, MMM d, yyyy")}
            </span>
            <Button variant="outline" size="icon" onClick={nextDay} disabled={isCurrentDay}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            {!isCurrentDay && (
              <Button variant="ghost" size="sm" onClick={goToday}>
                Today
              </Button>
            )}
          </div>

          {/* GitHub-style year activity grid */}
          <div className="pt-1">
            <p className="mb-3 text-[11px] font-medium text-white/30">{today.getFullYear()}</p>

            {/* Outer flex row: [day labels] [month labels + cells] */}
            <div className="flex gap-1.5">
              {/* Day-of-week labels — flex-1 rows track the grid rows automatically */}
              <div className="flex flex-col shrink-0 select-none" style={{ gap: "3px" }}>
                {["", "Mon", "", "Wed", "", "Fri", ""].map((l, i) => (
                  <div key={i} className="flex-1 flex items-center justify-end text-[8px] leading-none text-white/30 pr-0.5">
                    {l}
                  </div>
                ))}
              </div>

              {/* Cell column: month labels + cell grid */}
              <div className="flex-1 min-w-0">
                {/* Month labels: % positioned, clipped so they never overflow */}
                <div className="relative h-3.5 mb-1 overflow-hidden">
                  {monthMarkers.map(({ col, label }) => (
                    <span
                      key={label}
                      className="absolute text-[9px] leading-none font-medium text-white/40 select-none"
                      style={{ left: `${(col / Math.max(yearGrid.length, 1)) * 100}%` }}
                    >
                      {label}
                    </span>
                  ))}
                </div>

                {/* Cell grid: uniform 1fr columns so aspect-square resolves correctly */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${yearGrid.length}, 1fr)`,
                    gap: "3px",
                  }}
                >
                  {yearGrid.map((week, wi) =>
                    week.map((day, di) =>
                      day === null ? (
                        <div
                          key={`${wi}-${di}`}
                          className="aspect-square"
                          style={{ gridColumn: wi + 1, gridRow: di + 1 }}
                        />
                      ) : (
                        <GridCell
                          key={`${wi}-${di}`}
                          day={day}
                          col={wi + 1}
                          row={di + 1}
                          isSelected={isSameDay(day.d, date)}
                          isToday={isSameDay(day.d, today)}
                          maxYearSecs={maxYearSecs}
                          onClick={() => setDate(day.d)}
                        />
                      )
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Intraday activity bar */}
          <ActivityDayBar
            buckets={intradayData?.buckets ?? []}
            totalBuckets={intradayData?.total_buckets ?? 96}
          />

          {/* Daily breakdown */}
          {isLoading && !summary ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : !summary || summary.total_active_secs === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded for this day.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="mb-3 text-sm text-white/40">
                <span className="text-base font-medium text-white/80">
                  {fmtDur(summary.total_active_secs)}
                </span>{" "}
                active
                {sources.length === 1 && (
                  <span className="ml-2 text-xs">· {activeSource}</span>
                )}
              </p>
              {summary.apps.map((app, i) => {
                const rgb = APP_COLORS[i % APP_COLORS.length];
                return (
                  <div key={app.app_class} className="flex items-center gap-3">
                    <span className="w-44 shrink-0 truncate font-mono text-xs text-white/60">
                      {mapName(app.app_class)}
                    </span>
                    <div
                      className="relative h-2 flex-1 overflow-hidden rounded-full"
                      style={{ background: "rgba(255,255,255,0.07)" }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full transition-all"
                        style={{ width: `${app.percentage}%`, background: `rgba(${rgb},0.72)` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-white/45">
                      {fmtDur(app.active_secs)}
                    </span>
                    <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-white/25">
                      {app.percentage.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
