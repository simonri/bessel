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
import { useState } from "react";
import { ActivityCards } from "@/components/activity/activity-cards";
import {
  activitySentence,
  comparedToUsual,
  longestSession,
  prettyAppName,
  screenLane,
  sessionsFromBuckets,
  usualSecs,
  weekEndingOn,
} from "@/components/activity/activity-insights";
import { AppBreakdown } from "@/components/activity/app-breakdown";
import { DayRhythm } from "@/components/activity/day-rhythm";
import { WeekStrip } from "@/components/activity/week-strip";
import { DayNav } from "@/components/timeline/day-nav";
import { DayRibbon } from "@/components/timeline/day-ribbon";
import { useSettings } from "@/hooks/use-settings";
import { client } from "@/lib/client";
import { localDayBounds } from "./-activity-utils";
import { YearGrid, yearGridRange } from "./-year-grid";

const SURFACE = "rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.06]";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 px-1 text-xs font-medium text-white/55">{children}</h3>
  );
}

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
    return match?.to || prettyAppName(name);
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

  const daySummary = summary && summary.total_active_secs > 0 ? summary : null;
  const totalSecs = daySummary?.total_active_secs ?? 0;
  const days = yearDailyData?.days ?? [];
  const usual = usualSecs(days, date);
  const sessions = sessionsFromBuckets(
    intradayData?.buckets ?? [],
    intradayData?.bucket_mins ?? 15,
    startTs,
  );
  const topApp = daySummary?.apps[0]
    ? {
        name: mapName(daySummary.apps[0].app_class),
        percentage: daySummary.apps[0].percentage,
      }
    : null;
  const sentence = activitySentence({
    totalSecs,
    usual,
    topApp: topApp?.name ?? null,
    isToday: isCurrentDay,
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight text-white/90">
            {isCurrentDay
              ? "Your screen time"
              : `How ${format(date, "EEEE")} went`}
          </h2>
          <p className="mt-0.5 text-xs text-white/50">
            {sources.length === 0 && sourcesData
              ? "See where your hours go, one day at a time."
              : summary
                ? sentence
                : "\u00a0"}
          </p>
        </div>
        {sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {sources.length > 1 && (
              <Select
                value={activeSource ?? ""}
                onValueChange={(v) => setSource(v)}
              >
                <SelectTrigger
                  size="default"
                  className="w-auto min-w-0 gap-1.5 rounded-full border-0 bg-white/[0.04] px-3 text-xs ring-1 ring-white/[0.06] dark:bg-white/[0.04]"
                >
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
            <DayNav
              label={isCurrentDay ? "Today" : format(date, "EEE, MMM d")}
              onPrev={() => setDate((d) => subDays(d, 1))}
              onNext={() => setDate((d) => addDays(d, 1))}
              nextDisabled={isCurrentDay}
              onToday={isCurrentDay ? undefined : () => setDate(today)}
            />
          </div>
        )}
      </header>

      {!sourcesData ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-2xl bg-white/[0.05]" />
          <Skeleton className="h-28 w-full rounded-2xl bg-white/[0.05]" />
        </div>
      ) : sources.length === 0 ? (
        <div
          className={`${SURFACE} flex flex-col items-center gap-1.5 px-6 py-14 text-center`}
        >
          <p className="text-sm font-medium text-white/85">
            Your screen time lives here 💻
          </p>
          <p className="max-w-sm text-xs leading-relaxed text-white/50">
            Turn on the activity monitor in Settings → Services on your
            computer, and Bessel will show where your hours go.
          </p>
        </div>
      ) : (
        <>
          <ActivityCards
            totalSecs={totalSecs}
            compared={comparedToUsual(totalSecs, usual)}
            longest={longestSession(sessions)}
            topApp={topApp}
            tasksDone={completedTasksData?.pagination.total_count ?? null}
          />

          <section className={`${SURFACE} p-4`}>
            {sessions.length > 0 ? (
              <DayRibbon
                date={date}
                lanes={[screenLane(sessions, totalSecs)]}
                startTs={startTs}
                endTs={endTs}
                nowTs={isCurrentDay ? Date.now() / 1000 : null}
              />
            ) : (
              <p className="py-6 text-center text-xs text-white/45">
                {isCurrentDay
                  ? "Nothing on the clock yet today 🌿"
                  : "A screen-free day 🌿"}
              </p>
            )}
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <section className="min-w-0">
              <SectionTitle>Where the time went</SectionTitle>
              {isLoading && !summary ? (
                <div className={`${SURFACE} flex flex-col gap-3 p-4`}>
                  {[1, 2, 3, 4, 5].map((row) => (
                    <Skeleton
                      key={row}
                      className="h-7 w-full bg-white/[0.05]"
                    />
                  ))}
                </div>
              ) : daySummary ? (
                <AppBreakdown apps={daySummary.apps} displayName={mapName} />
              ) : (
                <p
                  className={`${SURFACE} px-4 py-8 text-center text-xs text-white/45`}
                >
                  No apps used this day.
                </p>
              )}
            </section>
            <section className="flex min-w-0 flex-col">
              <SectionTitle>Compared to the week</SectionTitle>
              <div className="flex flex-col gap-3">
                <WeekStrip
                  days={weekEndingOn(days, date, today)}
                  usual={usual}
                  onSelect={setDate}
                />
                <DayRhythm sessions={sessions} isToday={isCurrentDay} />
              </div>
            </section>
          </div>

          <section>
            <SectionTitle>Your {today.getFullYear()}</SectionTitle>
            <div className={`${SURFACE} p-3`}>
              <YearGrid
                year={today.getFullYear()}
                items={days}
                getDate={(d) => d.date}
                getValue={(d) => d.active_secs}
                color="var(--color-primary-500)"
                emptyLabel="No screen time"
                selectedDate={date}
                today={today}
                onSelectDay={setDate}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
