import {
  getLocationHistoryDayV1LocationHistoryDayGetOptions,
  getTimelineV1TimelineGetOptions,
  listActivitySourcesV1ActivitySourcesGetOptions,
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
import { addDays, format, isSameDay, subDays, subHours } from "date-fns";
import { useMemo, useState } from "react";
import { DayNav } from "@/components/timeline/day-nav";
import { DayRibbon } from "@/components/timeline/day-ribbon";
import {
  activityLane,
  dayMoments,
  daySentence,
  placesLane,
} from "@/components/timeline/day-summary";
import { MomentsList } from "@/components/timeline/moments-list";
import { SummaryCards } from "@/components/timeline/summary-cards";
import { PageHeader, SectionLabel } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { fmtDur, localDayBounds } from "./-activity-utils";
import { dayParam } from "./-google-timeline-utils";

// Days run 6am to 6am: a night out past midnight still belongs to the day
// before, and sleep shows whole at the start of the next.
const DAY_START_HOUR = 6;

export const Route = createFileRoute("/_app/timeline")({
  component: TimelinePage,
});

function TimelinePage() {
  const today = subHours(new Date(), DAY_START_HOUR);
  const [date, setDate] = useState(today);
  const [source, setSource] = useState<string | null>(null);
  const isToday = isSameDay(date, today);

  const { data: sourcesData } = useQuery({
    ...listActivitySourcesV1ActivitySourcesGetOptions({ client }),
  });
  const sources = sourcesData?.sources ?? [];

  const [startTs, endTs] = localDayBounds(date, DAY_START_HOUR);
  const { data: timeline, isLoading } = useQuery({
    ...getTimelineV1TimelineGetOptions({
      client,
      query: {
        start_ts: startTs,
        end_ts: endTs,
        ...(source ? { source } : {}),
      },
    }),
    placeholderData: keepPreviousData,
  });

  // Places come from an imported Google Timeline; most days may have none.
  // The day ends at 6am, so its last hours are on the next calendar date.
  const dayKey = format(date, "yyyy-MM-dd");
  const nextDayKey = format(addDays(date, 1), "yyyy-MM-dd");
  const locationDate = useMemo(() => dayParam(dayKey), [dayKey]);
  const nextLocationDate = useMemo(() => dayParam(nextDayKey), [nextDayKey]);
  const { data: locationDay } = useQuery({
    ...getLocationHistoryDayV1LocationHistoryDayGetOptions({
      client,
      query: { date: locationDate },
    }),
    retry: false,
  });
  const { data: nextLocationDay } = useQuery({
    ...getLocationHistoryDayV1LocationHistoryDayGetOptions({
      client,
      query: { date: nextLocationDate },
    }),
    retry: false,
  });

  const lanes = useMemo(() => {
    // Most days have no workout; no empty row for them.
    const activity = (timeline?.lanes ?? [])
      .filter((l) => l.key !== "workouts" || l.segments.length > 0)
      .map(activityLane);
    // A visit spanning midnight comes back for both dates.
    const visits = new Map(
      [...(locationDay?.visits ?? []), ...(nextLocationDay?.visits ?? [])].map(
        (v) => [v.id, v],
      ),
    );
    const places = placesLane([...visits.values()], startTs, endTs);
    return places.blocks.length > 0 ? [...activity, places] : activity;
  }, [timeline, locationDay, nextLocationDay, startTs, endTs]);

  const nowTs = Math.floor(Date.now() / 1000);
  const elapsedSecs = Math.max(0, Math.min(nowTs, endTs) - startTs);
  const freeSecs = timeline
    ? Math.max(0, elapsedSecs - timeline.tracked_secs)
    : null;
  const moments = dayMoments(lanes, startTs, endTs, fmtDur);
  const sentence = daySentence(lanes, fmtDur);
  const isEmpty = lanes.every((l) => l.blocks.length === 0);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        title={isToday ? "Your day so far" : `How ${format(date, "EEEE")} went`}
        summary={
          timeline
            ? (sentence ?? "Nothing recorded for this day yet.")
            : "\u00a0"
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {sources.length > 1 && (
            <Select
              value={source ?? timeline?.source ?? ""}
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
            label={isToday ? "Today" : format(date, "EEE, MMM d")}
            onPrev={() => setDate((d) => subDays(d, 1))}
            onNext={() => setDate((d) => addDays(d, 1))}
            nextDisabled={isToday}
            onToday={isToday ? undefined : () => setDate(today)}
          />
        </div>
      </PageHeader>

      <SummaryCards
        lanes={lanes}
        freeSecs={isEmpty ? null : freeSecs}
        isToday={isToday}
      />

      <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06]">
        {isLoading && !timeline ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((row) => (
              <Skeleton
                key={row}
                className="h-8 w-full rounded-full bg-white/[0.06]"
              />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="flex flex-col items-center gap-1 py-8 text-center">
            <p className="text-sm font-medium text-white/80">A quiet day 🌙</p>
            <p className="max-w-sm text-xs leading-relaxed text-white/45">
              Nothing was recorded here. Sleep comes from Apple Health, screen
              time from the activity monitor and places from your Google
              Timeline.
            </p>
          </div>
        ) : (
          <DayRibbon
            date={date}
            lanes={lanes}
            startTs={startTs}
            endTs={endTs}
            nowTs={isToday ? nowTs : null}
          />
        )}
      </section>

      {!isEmpty && moments.length > 0 && (
        <section>
          <SectionLabel>Moments</SectionLabel>
          <div className="rounded-2xl bg-white/[0.03] p-2 ring-1 ring-white/[0.06]">
            <MomentsList moments={moments} />
          </div>
        </section>
      )}
    </div>
  );
}
