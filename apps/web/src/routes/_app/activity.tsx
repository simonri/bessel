import {
  getActivitySummaryV1ActivitySummaryGetOptions,
  getDailyActivityV1ActivityDailyGetOptions,
  getIntradayActivityV1ActivityIntradayGetOptions,
  listActivitySourcesV1ActivitySourcesGetOptions,
  listTasksV1TasksGetOptions,
  TaskStatus,
} from "@bessel/client";
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
import { Activity, Clock } from "lucide-react";
import { useState } from "react";
import {
  BarRow,
  EmptyState,
  PageToolbar,
  PeriodNav,
  SectionLabel,
  SoftButton,
  StatTile,
} from "@/components/ui-kit";
import { useSettings } from "@/hooks/use-settings";
import { client } from "@/lib/client";
import { ActivityDayBar } from "./-activity-day-bar";
import { APP_COLORS, fmtDur, localDayBounds } from "./-activity-utils";
import { YearGrid, yearGridRange } from "./-year-grid";

export const Route = createFileRoute("/_app/activity")({
  component: ActivityPage,
});

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

  const daySummary = summary && summary.total_active_secs > 0 ? summary : null;
  const maxAppSecs = Math.max(
    ...(daySummary?.apps.map((app) => app.active_secs) ?? []),
    1,
  );

  return (
    <div className="space-y-5">
      <PageToolbar description="Time tracking from the desktop monitor.">
        {sources.length > 1 && (
          <Select
            value={activeSource ?? ""}
            onValueChange={(v) => setSource(v)}
          >
            <SelectTrigger className="w-44 min-w-0 border-white/10 bg-white/[0.04]">
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
        {sources.length > 0 && (
          <>
            {!isCurrentDay && <SoftButton onClick={goToday}>Today</SoftButton>}
            <PeriodNav
              label={isCurrentDay ? "Today" : format(date, "EEE, MMM d, yyyy")}
              onPrev={prevDay}
              onNext={nextDay}
              nextDisabled={isCurrentDay}
            />
          </>
        )}
      </PageToolbar>

      {!sourcesData ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl bg-white/[0.06]" />
          <Skeleton className="h-32 w-full rounded-xl bg-white/[0.06]" />
        </div>
      ) : sources.length === 0 ? (
        <EmptyState icon={<Activity />} title="No activity yet">
          Run{" "}
          <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-11 text-white/75">
            ./main.py --push
          </code>{" "}
          in{" "}
          <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 font-mono text-11 text-white/75">
            services/monitor
          </code>{" "}
          to sync your activity history.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
            <StatTile
              label="Active time"
              value={daySummary ? fmtDur(daySummary.total_active_secs) : "—"}
              hint={sources.length === 1 ? activeSource : undefined}
            />
            <StatTile
              label="Apps used"
              value={daySummary?.apps.length ?? "—"}
              hint={
                daySummary?.apps[0]
                  ? `Top: ${mapName(daySummary.apps[0].app_class)}`
                  : undefined
              }
            />
            <StatTile
              label="Tasks completed"
              value={completedTasksData?.pagination.total_count ?? "—"}
            />
          </div>

          <section>
            <SectionLabel>{today.getFullYear()}</SectionLabel>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
              <YearGrid
                year={today.getFullYear()}
                items={yearDailyData?.days ?? []}
                getDate={(d) => d.date}
                getValue={(d) => d.active_secs}
                color="var(--color-primary-500)"
                emptyLabel="No activity"
                selectedDate={date}
                today={today}
                onSelectDay={setDate}
              />
            </div>
          </section>

          <section>
            <SectionLabel>Timeline</SectionLabel>
            <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-4 pt-4 pb-3">
              <ActivityDayBar
                buckets={intradayData?.buckets ?? []}
                totalBuckets={intradayData?.total_buckets ?? 96}
              />
            </div>
          </section>

          <section>
            <SectionLabel>By app</SectionLabel>
            {isLoading && !summary ? (
              <div className="space-y-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full bg-white/[0.06]" />
                ))}
              </div>
            ) : !daySummary ? (
              <EmptyState icon={<Clock />} title="Nothing tracked">
                No activity recorded for this day.
              </EmptyState>
            ) : (
              <div className="space-y-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                {daySummary.apps.map((app, i) => (
                  <BarRow
                    key={app.app_class}
                    label={mapName(app.app_class)}
                    fraction={app.active_secs / maxAppSecs}
                    value={fmtDur(app.active_secs)}
                    detail={`${app.percentage.toFixed(1)}%`}
                    color={`rgb(${APP_COLORS[i % APP_COLORS.length]} / 0.8)`}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
