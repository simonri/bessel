import {
  getDailySleepV1HealthkitSleepDailyGetOptions,
  getSleepSummaryV1HealthkitSleepSummaryGetOptions,
} from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format, isSameDay, subDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { client } from "@/lib/client";
import { fmtDur } from "./-activity-utils";
import { SleepGridCell, type SleepGridDay } from "./-sleep-grid-cell";

export const Route = createFileRoute("/_app/sleep")({
  component: SleepPage,
});

// Fixed stage -> color mapping (entity-based, not sort order) validated with
// the dataviz skill's palette validator against this app's dark surface.
const STAGE_ORDER = [
  "awake",
  "asleepREM",
  "asleepCore",
  "asleepUnspecified",
  "asleepDeep",
] as const;

const STAGE_META: Record<string, { label: string; rgb: string }> = {
  awake: { label: "Awake", rgb: "201,133,0" },
  asleepREM: { label: "REM", rgb: "25,158,112" },
  asleepCore: { label: "Core", rgb: "57,135,229" },
  asleepUnspecified: { label: "Asleep", rgb: "57,135,229" },
  asleepDeep: { label: "Deep", rgb: "213,81,129" },
};

// Nights are bucketed noon-to-noon (matches the backend's wake-date
// attribution), so the window for a selected date runs from noon the day
// before to noon on the date itself.
function localNightBounds(d: Date): [number, number] {
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 12);
  return [Math.floor(start.getTime() / 1000), Math.floor(end.getTime() / 1000)];
}

function SleepPage() {
  const today = new Date();
  const [date, setDate] = useState(today);
  const isCurrentDay = isSameDay(date, today);
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [startTs, endTs] = localNightBounds(date);
  const { data: summary, isLoading } = useQuery({
    ...getSleepSummaryV1HealthkitSleepSummaryGetOptions({
      client,
      query: { start_ts: startTs, end_ts: endTs },
    }),
    placeholderData: keepPreviousData,
  });

  // Full calendar year grid: Jan 1 → Dec 31, padded to week boundaries
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const calYearStart = new Date(today.getFullYear(), 0, 1);
  const yearGridStart = subDays(calYearStart, calYearStart.getDay()); // Sunday on/before Jan 1
  const calYearEnd = new Date(today.getFullYear(), 11, 31);
  const yearGridEnd = addDays(calYearEnd, 6 - calYearEnd.getDay()); // Saturday on/after Dec 31
  const yearRangeStart = Math.floor(yearGridStart.getTime() / 1000);
  const yearRangeEnd = Math.floor(
    new Date(
      todayMidnight.getFullYear(),
      todayMidnight.getMonth(),
      todayMidnight.getDate() + 1,
    ).getTime() / 1000,
  );

  const { data: yearDailyData } = useQuery({
    ...getDailySleepV1HealthkitSleepDailyGetOptions({
      client,
      query: { start_ts: yearRangeStart, end_ts: yearRangeEnd, tz_name: tzName },
    }),
  });

  const yearDailyMap = new Map(
    yearDailyData?.nights.map((n) => [n.date, n.asleep_secs]) ?? [],
  );
  const maxYearSecs = Math.max(
    ...(yearDailyData?.nights.map((n) => n.asleep_secs) ?? []),
    1,
  );

  // Build week columns: full calendar year, future dates are null (empty cells)
  const yearGrid: SleepGridDay[][] = [];
  let ws = new Date(yearGridStart);
  while (ws <= yearGridEnd) {
    const week: SleepGridDay[] = [];
    for (let di = 0; di < 7; di++) {
      const d = addDays(ws, di);
      if (d.getFullYear() !== today.getFullYear()) {
        week.push(null); // padding days outside the calendar year
      } else {
        const dateStr = format(d, "yyyy-MM-dd");
        week.push({ d, dateStr, asleep_secs: yearDailyMap.get(dateStr) ?? 0 });
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

  const stages = STAGE_ORDER.map((key) => {
    const s = summary?.stages.find((x) => x.stage === key);
    return s ? { key, meta: STAGE_META[key], ...s } : null;
  }).filter((s): s is NonNullable<typeof s> => s !== null && s.secs > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sleep</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nightly sleep from Apple Health.
        </p>
      </div>

      {/* Date navigation */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={prevDay}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium">
          {isCurrentDay ? "Last night" : format(date, "EEE, MMM d, yyyy")}
        </span>
        <Button
          variant="outline"
          size="icon"
          onClick={nextDay}
          disabled={isCurrentDay}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {!isCurrentDay && (
          <Button variant="ghost" size="sm" onClick={goToday}>
            Today
          </Button>
        )}
      </div>

      {/* GitHub-style year sleep grid */}
      <div className="pt-1">
        <p className="mb-3 text-11 font-medium text-white/50">
          {today.getFullYear()}
        </p>

        <div className="flex gap-1.5">
          <div
            className="flex flex-col shrink-0 select-none"
            style={{ gap: "3px" }}
          >
            {["", "Mon", "", "Wed", "", "Fri", ""].map((l, i) => (
              <div
                key={i}
                className="flex-1 flex items-center justify-end text-8 leading-none text-white/50 pr-0.5"
              >
                {l}
              </div>
            ))}
          </div>

          <div className="flex-1 min-w-0">
            <div className="relative h-3.5 mb-1 overflow-hidden">
              {monthMarkers.map(({ col, label }) => (
                <span
                  key={label}
                  className="absolute text-9 leading-none font-medium text-white/50 select-none"
                  style={{
                    left: `${(col / Math.max(yearGrid.length, 1)) * 100}%`,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

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
                    <SleepGridCell
                      key={`${wi}-${di}`}
                      day={day}
                      col={wi + 1}
                      row={di + 1}
                      isSelected={isSameDay(day.d, date)}
                      isToday={isSameDay(day.d, today)}
                      maxYearSecs={maxYearSecs}
                      onClick={() => setDate(day.d)}
                    />
                  ),
                ),
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Selected-night stage breakdown */}
      {isLoading && !summary ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-6 w-full animate-pulse rounded bg-white/5" />
          ))}
        </div>
      ) : !summary || summary.total_asleep_secs === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sleep data recorded for this night.
        </p>
      ) : (
        <div className="space-y-1.5">
          <p className="mb-3 text-sm text-white/50">
            <span className="text-base font-medium text-white/80">
              {fmtDur(summary.total_asleep_secs)}
            </span>{" "}
            asleep
          </p>
          {stages.map((stage) => (
            <div key={stage.key} className="flex items-center gap-3">
              <span className="w-16 shrink-0 truncate font-mono text-xs text-white/60">
                {stage.meta.label}
              </span>
              <div
                className="relative h-2 flex-1 overflow-hidden rounded-full"
                style={{ background: "rgba(255,255,255,0.07)" }}
              >
                <div
                  className="absolute inset-y-0 left-0 w-full rounded-full transition-transform"
                  style={{
                    transform: `translateX(-${100 - stage.percentage}%)`,
                    background: `rgba(${stage.meta.rgb},0.85)`,
                  }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums text-white/50">
                {fmtDur(stage.secs)}
              </span>
              <span className="w-10 shrink-0 text-right text-11 tabular-nums text-white/50">
                {stage.percentage.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
