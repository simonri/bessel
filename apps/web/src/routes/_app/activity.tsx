import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isSameDay, format, subDays, addDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  listActivitySourcesV1ActivitySourcesGetOptions,
  getActivitySummaryV1ActivitySummaryGetOptions,
  getDailyActivityV1ActivityDailyGetOptions,
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

export const Route = createFileRoute("/_app/activity")({
  component: ActivityPage,
});

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

export function ActivityPage() {
  const today = new Date();
  const [date, setDate] = useState(today);
  const [source, setSource] = useState<string | null>(null);

  const isCurrentDay = isSameDay(date, today);

  const { data: sourcesData } = useQuery({
    ...listActivitySourcesV1ActivitySourcesGetOptions({ client }),
  });
  const sources = sourcesData?.sources ?? [];
  const activeSource = source ?? sources[0] ?? null;

  const [startTs, endTs] = localDayBounds(date);

  const { data: summary, isLoading } = useQuery({
    ...getActivitySummaryV1ActivitySummaryGetOptions({
      client,
      query: { start_ts: startTs, end_ts: endTs, source: activeSource! },
    }),
    enabled: !!activeSource,
    placeholderData: keepPreviousData,
  });

  const tzOffsetMins = -new Date().getTimezoneOffset();
  const rangeStart = Math.floor(subDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), 29).getTime() / 1000);
  const rangeEnd = Math.floor(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).getTime() / 1000);

  const { data: dailyData } = useQuery({
    ...getDailyActivityV1ActivityDailyGetOptions({
      client,
      query: { start_ts: rangeStart, end_ts: rangeEnd, source: activeSource!, tz_offset_mins: tzOffsetMins },
    }),
    enabled: !!activeSource,
  });

  const dailyMap = new Map(dailyData?.days.map((d) => [d.date, d.active_secs]) ?? []);
  const last30Days = Array.from({ length: 30 }, (_, i) => {
    const d = subDays(today, 29 - i);
    const dateStr = format(d, "yyyy-MM-dd");
    return { d, dateStr, active_secs: dailyMap.get(dateStr) ?? 0 };
  });
  const maxSecs = Math.max(...last30Days.map((d) => d.active_secs), 1);

  const prevDay = () => setDate((d) => subDays(d, 1));
  const nextDay = () => setDate((d) => addDays(d, 1));
  const goToday = () => setDate(today);

  return (
    <div className="space-y-6">
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

          {isLoading && !summary ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : !summary || summary.total_active_secs === 0 ? (
            <p className="text-sm text-muted-foreground">
              No activity recorded for this day.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="mb-4 text-sm text-muted-foreground">
                <span className="text-base font-medium text-foreground">
                  {fmtDur(summary.total_active_secs)}
                </span>{" "}
                active
                {sources.length === 1 && (
                  <span className="ml-2 text-xs">· {activeSource}</span>
                )}
              </p>

              {summary.apps.map((app) => (
                <div key={app.app_class} className="flex items-center gap-3">
                  <span className="w-48 shrink-0 truncate font-mono text-sm text-foreground">
                    {app.app_class}
                  </span>
                  <div className="relative h-5 flex-1 overflow-hidden rounded-sm bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded-sm bg-primary/60"
                      style={{ width: `${app.percentage}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right text-sm tabular-nums text-muted-foreground">
                    {fmtDur(app.active_secs)}
                  </span>
                  <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {app.percentage.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2">
            <p className="mb-2 text-xs text-muted-foreground">Last 30 days</p>
            <div className="flex h-12 items-end gap-px">
              {last30Days.map(({ d, dateStr, active_secs }) => {
                const heightPct = active_secs > 0 ? Math.max((active_secs / maxSecs) * 100, 4) : 0;
                const isSelectedDay = isSameDay(d, date);
                const isDayToday = isSameDay(d, today);
                return (
                  <button
                    key={dateStr}
                    title={`${format(d, "EEE, MMM d")}: ${active_secs > 0 ? fmtDur(active_secs) : "No activity"}`}
                    onClick={() => setDate(d)}
                    className="relative flex-1 h-full cursor-pointer"
                  >
                    <div
                      className={`absolute bottom-0 left-0 right-0 rounded-t-sm transition-colors ${
                        isDayToday
                          ? "bg-primary"
                          : isSelectedDay
                            ? "bg-primary/70"
                            : "bg-primary/30"
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
