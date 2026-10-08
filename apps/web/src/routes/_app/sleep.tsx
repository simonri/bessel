import {
  getDailySleepV1HealthkitSleepDailyGetOptions,
  getHealthSummaryV1HealthkitSummaryGetOptions,
  getSleepSummaryV1HealthkitSleepSummaryGetOptions,
  getTimelineV1TimelineGetOptions,
} from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format, isSameDay, subDays } from "date-fns";
import { useMemo, useState } from "react";
import { DayRings } from "@/components/health/day-rings";
import { NightChart } from "@/components/sleep/night-chart";
import { RhythmChart } from "@/components/sleep/rhythm-chart";
import { SleepCards } from "@/components/sleep/sleep-cards";
import {
  consistencyLabel,
  nightMood,
  rhythmStats,
} from "@/components/sleep/sleep-summary";
import { StageBreakdown } from "@/components/sleep/stage-breakdown";
import { DayNav } from "@/components/timeline/day-nav";
import { SectionLabel } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { fmtDur } from "./-activity-utils";
import { dayParam } from "./-google-timeline-utils";
import { STAGE_META, STAGE_ORDER } from "./-sleep-utils";
import { YearGrid, yearGridRange } from "./-year-grid";

export const Route = createFileRoute("/_app/sleep")({
  component: SleepPage,
});

const RHYTHM_NIGHTS = 14;
const SKELETON_ROWS = ["awake", "rem", "core", "deep"];
const CARD = "rounded-2xl bg-white/[0.04] p-4 ring-1 ring-white/[0.06]";

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
  const dateKey = format(date, "yyyy-MM-dd");

  const [startTs, endTs] = localNightBounds(date);
  const { data: summary, isLoading } = useQuery({
    ...getSleepSummaryV1HealthkitSleepSummaryGetOptions({
      client,
      query: { start_ts: startTs, end_ts: endTs },
    }),
    placeholderData: keepPreviousData,
  });

  // The timeline's sleep lane carries every stage segment of the night,
  // which is what the hypnogram draws.
  const { data: nightTimeline } = useQuery({
    ...getTimelineV1TimelineGetOptions({
      client,
      query: { start_ts: startTs, end_ts: endTs },
    }),
    placeholderData: keepPreviousData,
  });

  // The night picked is the one that ended on `date`, which is also the day
  // the summary scores.
  const { data: daySummary } = useQuery({
    ...getHealthSummaryV1HealthkitSummaryGetOptions({
      client,
      query: { date: dayParam(dateKey), tz_name: tzName },
    }),
    placeholderData: keepPreviousData,
  });

  const rhythmDays = useMemo(
    () =>
      Array.from({ length: RHYTHM_NIGHTS }, (_, i) =>
        subDays(date, RHYTHM_NIGHTS - 1 - i),
      ),
    [date],
  );
  const { data: recent } = useQuery({
    ...getDailySleepV1HealthkitSleepDailyGetOptions({
      client,
      query: {
        start_ts: localNightBounds(rhythmDays[0])[0],
        end_ts: endTs,
        tz_name: tzName,
      },
    }),
    placeholderData: keepPreviousData,
  });

  const [yearRangeStart, yearRangeEnd] = yearGridRange(today);
  const { data: yearDailyData } = useQuery({
    ...getDailySleepV1HealthkitSleepDailyGetOptions({
      client,
      query: {
        start_ts: yearRangeStart,
        end_ts: yearRangeEnd,
        tz_name: tzName,
      },
    }),
  });

  const recentNights = recent?.nights ?? [];
  const thisNight = recentNights.find((n) => n.date === dateKey) ?? null;
  // "Usual" is the other nights in the window, so tonight doesn't pull the
  // average toward itself.
  const usual = rhythmStats(recentNights.filter((n) => n.date !== dateKey));
  const rhythm = rhythmStats(recentNights);

  const stages = STAGE_ORDER.map((key) => {
    const s = summary?.stages.find((x) => x.stage === key);
    return s && s.secs > 0
      ? { key: key as string, secs: s.secs, percentage: s.percentage }
      : null;
  }).filter((s): s is NonNullable<typeof s> => s !== null);
  const stageSecs = (key: string) =>
    stages.find((s) => s.key === key)?.secs ?? 0;

  const night = summary && summary.total_asleep_secs > 0 ? summary : null;
  const sleepSegments = (
    nightTimeline?.lanes.find((l) => l.key === "sleep")?.segments ?? []
  ).filter((s) => s.label in STAGE_META);

  const sentence = night
    ? `You slept ${fmtDur(night.total_asleep_secs)} - ${nightMood(night.total_asleep_secs)}`
    : "No sleep recorded for this night.";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-white/90">
            {isCurrentDay ? "Last night" : format(date, "EEEE d MMMM")}
          </h1>
          <p className="mt-1 text-13 text-white/55">{sentence}</p>
        </div>
        <DayNav
          label={isCurrentDay ? "Last night" : format(date, "EEE d MMM")}
          onPrev={() => setDate((d) => subDays(d, 1))}
          onNext={() => setDate((d) => addDays(d, 1))}
          nextDisabled={isCurrentDay}
          onToday={isCurrentDay ? undefined : () => setDate(today)}
        />
      </header>

      {daySummary && <DayRings summary={daySummary} />}

      <SleepCards
        asleepSecs={night?.total_asleep_secs ?? null}
        usualAsleepSecs={usual.avgAsleepSecs}
        onset={thisNight?.sleep_onset ?? null}
        wake={thisNight?.wake_time ?? null}
        usualBedtime={usual.avgBedtime}
        usualWake={usual.avgWake}
        deepSecs={stageSecs("asleepDeep")}
        remSecs={stageSecs("asleepREM")}
      />

      <section>
        <SectionLabel>The night</SectionLabel>
        {isLoading && !summary ? (
          <div className={`${CARD} space-y-2.5`}>
            {SKELETON_ROWS.map((row) => (
              <Skeleton key={row} className="h-5 w-full bg-white/[0.06]" />
            ))}
          </div>
        ) : !night ? (
          <div
            className={`${CARD} flex flex-col items-center gap-1 py-10 text-center`}
          >
            <p className="text-sm font-medium text-white/80">
              No sleep here yet 🌙
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-white/45">
              Sleep comes from Apple Health through the Bessel app on your
              iPhone. Wear your watch to bed and the night shows up here.
            </p>
          </div>
        ) : (
          <div className={`${CARD} @container flex flex-col gap-5`}>
            <NightChart segments={sleepSegments} />
            <StageBreakdown stages={stages} />
          </div>
        )}
      </section>

      {rhythm.nights > 1 && (
        <section>
          <SectionLabel>Your rhythm</SectionLabel>
          <div className={`${CARD} flex flex-col gap-4`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-13 font-medium text-white/80">
                {consistencyLabel(rhythm.bedtimeSpread)}
              </p>
              <p className="text-11 text-white/45">
                Last {RHYTHM_NIGHTS} nights - usually{" "}
                {rhythm.avgAsleepSecs !== null &&
                  fmtDur(Math.round(rhythm.avgAsleepSecs))}
              </p>
            </div>
            <RhythmChart
              days={rhythmDays}
              nights={recentNights}
              selected={date}
              avgBedtime={rhythm.avgBedtime}
              avgWake={rhythm.avgWake}
              onSelect={setDate}
            />
          </div>
        </section>
      )}

      <section>
        <SectionLabel>{today.getFullYear()}</SectionLabel>
        <div className={CARD}>
          <YearGrid
            year={today.getFullYear()}
            items={yearDailyData?.nights ?? []}
            getDate={(n) => n.date}
            getValue={(n) => n.asleep_secs}
            color="oklch(0.78 0.09 290)"
            emptyLabel="No sleep data"
            selectedDate={date}
            today={today}
            onSelectDay={setDate}
          />
        </div>
      </section>
    </div>
  );
}
