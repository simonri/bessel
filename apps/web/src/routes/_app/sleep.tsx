import {
  getDailySleepV1HealthkitSleepDailyGetOptions,
  getSleepSummaryV1HealthkitSleepSummaryGetOptions,
} from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { addDays, format, isSameDay, subDays } from "date-fns";
import { Moon } from "lucide-react";
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
import { client } from "@/lib/client";
import { fmtDur } from "./-activity-utils";
import { STAGE_META, STAGE_ORDER } from "./-sleep-utils";
import { YearGrid, yearGridRange } from "./-year-grid";

export const Route = createFileRoute("/_app/sleep")({
  component: SleepPage,
});

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

  const prevDay = () => setDate((d) => subDays(d, 1));
  const nextDay = () => setDate((d) => addDays(d, 1));
  const goToday = () => setDate(today);

  const stages = STAGE_ORDER.map((key) => {
    const s = summary?.stages.find((x) => x.stage === key);
    return s ? { key, meta: STAGE_META[key], ...s } : null;
  }).filter((s): s is NonNullable<typeof s> => s !== null && s.secs > 0);

  const night = summary && summary.total_asleep_secs > 0 ? summary : null;
  const maxStageSecs = Math.max(...stages.map((s) => s.secs), 1);
  const stageSecs = (key: string) =>
    stages.find((s) => s.key === key)?.secs ?? 0;

  return (
    <div className="space-y-5">
      <PageToolbar description="Nightly sleep from Apple Health.">
        {!isCurrentDay && <SoftButton onClick={goToday}>Today</SoftButton>}
        <PeriodNav
          label={isCurrentDay ? "Last night" : format(date, "EEE, MMM d, yyyy")}
          onPrev={prevDay}
          onNext={nextDay}
          nextDisabled={isCurrentDay}
        />
      </PageToolbar>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
        <StatTile
          label="Asleep"
          value={night ? fmtDur(night.total_asleep_secs) : "—"}
        />
        <StatTile
          label="Deep"
          value={night ? fmtDur(stageSecs("asleepDeep")) : "—"}
        />
        <StatTile
          label="REM"
          value={night ? fmtDur(stageSecs("asleepREM")) : "—"}
        />
        <StatTile
          label="Awake"
          value={night ? fmtDur(stageSecs("awake")) : "—"}
        />
      </div>

      <section>
        <SectionLabel>{today.getFullYear()}</SectionLabel>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3">
          <YearGrid
            year={today.getFullYear()}
            items={yearDailyData?.nights ?? []}
            getDate={(n) => n.date}
            getValue={(n) => n.asleep_secs}
            color="rgb(129 140 248)"
            emptyLabel="No sleep data"
            selectedDate={date}
            today={today}
            onSelectDay={setDate}
          />
        </div>
      </section>

      <section>
        <SectionLabel>Stages</SectionLabel>
        {isLoading && !summary ? (
          <div className="space-y-2.5 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full bg-white/[0.06]" />
            ))}
          </div>
        ) : !night ? (
          <EmptyState icon={<Moon />} title="No sleep data">
            Nothing recorded for this night.
          </EmptyState>
        ) : (
          <div className="space-y-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
              {stages.map((stage) => (
                <div
                  key={stage.key}
                  title={`${stage.meta.label} - ${fmtDur(stage.secs)}`}
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    flexGrow: stage.secs,
                    background: `rgb(${stage.meta.rgb} / 0.85)`,
                  }}
                />
              ))}
            </div>
            <div className="space-y-2.5">
              {stages.map((stage) => (
                <BarRow
                  key={stage.key}
                  label={
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: `rgb(${stage.meta.rgb})` }}
                      />
                      {stage.meta.label}
                    </span>
                  }
                  fraction={stage.secs / maxStageSecs}
                  value={fmtDur(stage.secs)}
                  detail={`${stage.percentage.toFixed(1)}%`}
                  color={`rgb(${stage.meta.rgb} / 0.85)`}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
