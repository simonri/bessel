import {
  getActivitySummaryV1ActivitySummaryGetOptions,
  getDailyActivityV1ActivityDailyGetOptions,
  getIntradayActivityV1ActivityIntradayGetOptions,
  listActivitySourcesV1ActivitySourcesGetOptions,
  listTasksV1TasksGetOptions,
  TaskStatus,
} from "@bessel/client";
import { Button } from "@bessel/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bessel/ui/components/select";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format, isSameDay, subDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useSettings } from "@/hooks/use-settings";
import { client } from "@/lib/client";
import { ActivityDayBar } from "./-activity-day-bar";
import { fmtDur, localDayBounds } from "./-activity-utils";
import { YearGrid, yearGridRange } from "./-year-grid";

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
        status: [TaskStatus.DONE],
        completed_after: startTs,
        completed_before: endTs,
        limit: 1,
      },
    }),
    placeholderData: keepPreviousData,
  });

  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [yearRangeStart, yearRangeEnd] = yearGridRange(today);

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
          <YearGrid
            year={today.getFullYear()}
            items={yearDailyData?.days ?? []}
            getDate={(d) => d.date}
            getValue={(d) => d.active_secs}
            color="232,113,75"
            emptyLabel="No activity"
            selectedDate={date}
            today={today}
            onSelectDay={setDate}
          />

          {/* Intraday activity bar */}
          <ActivityDayBar
            buckets={intradayData?.buckets ?? []}
            totalBuckets={intradayData?.total_buckets ?? 96}
          />

          {/* Tasks completed */}
          {completedTasksData !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-white/50">Tasks completed</span>
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
              <p className="mb-3 text-sm text-white/50">
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
                        className="absolute inset-y-0 left-0 w-full rounded-full transition-transform"
                        style={{
                          transform: `translateX(-${100 - app.percentage}%)`,
                          background: `rgba(${rgb},0.72)`,
                        }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-white/50">
                      {fmtDur(app.active_secs)}
                    </span>
                    <span className="w-10 shrink-0 text-right text-11 tabular-nums text-white/50">
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
