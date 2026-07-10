import {
  getActivitySummaryV1ActivitySummaryGetOptions,
  getDailyActivityV1ActivityDailyGetOptions,
  getIntradayActivityV1ActivityIntradayGetOptions,
  listActivitySourcesV1ActivitySourcesGetOptions,
  listTasksV1TasksGetOptions,
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
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format, isSameDay, subDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { client } from "@/lib/client";
import { ActivityDayBar } from "./-activity-day-bar";
import { GridCell, type GridDay } from "./-activity-grid-cell";
import { fmtDur, localDayBounds } from "./-activity-utils";

export const Route = createFileRoute("/_app/activity")({
  component: ActivityPage,
});

// Indexed colors for app bars (per app, by position)
const APP_COLORS = [
  "232,113,75", // warm orange
  "147,131,250", // soft violet
  "96,165,250", // sky blue
  "52,211,153", // emerald
  "251,191,36", // amber
  "244,114,182", // rose pink
  "34,211,238", // cyan
  "192,132,252", // lavender
  "251,146,60", // peach
  "74,222,128", // lime
];

function ActivityPage() {
  const today = new Date();
  const [date, setDate] = useState(today);
  const [source, setSource] = useState<string | null>(null);
  const { settings } = useSettings();

  const mapName = (name: string) => {
    const match = settings.activityMappings.find(
      (m) => m.from && m.from === name,
    );
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
      query: {
        start_ts: startTs,
        end_ts: endTs,
        source: activeSource!,
        bucket_mins: 15,
      },
    }),
    enabled: !!activeSource,
    placeholderData: keepPreviousData,
  });

  const { data: completedTasksData } = useQuery({
    ...listTasksV1TasksGetOptions({
      client,
      query: {
        status: "done",
        completed_after: startTs,
        completed_before: endTs,
        limit: 1,
      },
    }),
    placeholderData: keepPreviousData,
  });

  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

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
    ...getDailyActivityV1ActivityDailyGetOptions({
      client,
      query: {
        start_ts: yearRangeStart,
        end_ts: yearRangeEnd,
        source: activeSource!,
        tz_name: tzName,
      },
    }),
    enabled: !!activeSource,
  });

  const yearDailyMap = new Map(
    yearDailyData?.days.map((d) => [d.date, d.active_secs]) ?? [],
  );
  const maxYearSecs = Math.max(
    ...(yearDailyData?.days.map((d) => d.active_secs) ?? []),
    1,
  );

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
          <Select
            value={activeSource ?? ""}
            onValueChange={(v) => setSource(v)}
          >
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

          {/* GitHub-style year activity grid */}
          <div className="pt-1">
            <p className="mb-3 text-[11px] font-medium text-white/30">
              {today.getFullYear()}
            </p>

            {/* Outer flex row: [day labels] [month labels + cells] */}
            <div className="flex gap-1.5">
              {/* Day-of-week labels — flex-1 rows track the grid rows automatically */}
              <div
                className="flex flex-col shrink-0 select-none"
                style={{ gap: "3px" }}
              >
                {["", "Mon", "", "Wed", "", "Fri", ""].map((l, i) => (
                  <div
                    key={i}
                    className="flex-1 flex items-center justify-end text-[8px] leading-none text-white/30 pr-0.5"
                  >
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
                      style={{
                        left: `${(col / Math.max(yearGrid.length, 1)) * 100}%`,
                      }}
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
                      ),
                    ),
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

          {/* Tasks completed */}
          {completedTasksData !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/40">Tasks completed</span>
              <span className="text-sm font-medium text-white/80">
                {completedTasksData.pagination.total_count}
              </span>
            </div>
          )}

          {/* Daily breakdown */}
          {isLoading && !summary ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          ) : !summary || summary.total_active_secs === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity recorded for this day.
            </p>
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
                        style={{
                          width: `${app.percentage}%`,
                          background: `rgba(${rgb},0.72)`,
                        }}
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
