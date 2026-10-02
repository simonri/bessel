import {
  getTimelineV1TimelineGetOptions,
  listActivitySourcesV1ActivitySourcesGetOptions,
  type TimelineLane,
  type TimelineLaneKey,
  type TimelineSegment,
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
import { Monitor, Moon } from "lucide-react";
import { useState } from "react";
import {
  PageToolbar,
  PeriodNav,
  SectionLabel,
  SoftButton,
  StatTile,
} from "@/components/ui-kit";
import { useSettings } from "@/hooks/use-settings";
import { client } from "@/lib/client";
import { APP_COLORS, fmtDur, localDayBounds } from "./-activity-utils";
import { STAGE_META, STAGE_ORDER } from "./-sleep-utils";

export const Route = createFileRoute("/_app/timeline")({
  component: TimelinePage,
});

const OTHER_RGB = "148 148 160";
const AXIS_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

interface LegendItem {
  label: string;
  rgb: string;
  secs: number;
}

interface LaneView {
  key: TimelineLaneKey;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  totalSecs: number;
  segments: (TimelineSegment & { name: string; rgb: string })[];
  legend: LegendItem[];
}

function secsBy<T extends TimelineSegment>(
  segments: T[],
  keyOf: (s: T) => string,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const s of segments) {
    const key = keyOf(s);
    totals.set(key, (totals.get(key) ?? 0) + s.end_ts - s.start_ts);
  }
  return totals;
}

function sleepLaneView(lane: TimelineLane): LaneView {
  const totals = secsBy(lane.segments, (s) => s.label);
  const meta = (stage: string) =>
    STAGE_META[stage] ?? { label: stage, rgb: OTHER_RGB };
  return {
    key: lane.key,
    title: "Sleep",
    icon: Moon,
    totalSecs: lane.total_secs,
    segments: lane.segments.map((s) => ({
      ...s,
      name: meta(s.label).label,
      rgb: meta(s.label).rgb,
    })),
    legend: STAGE_ORDER.filter((stage) => totals.has(stage)).map((stage) => ({
      ...meta(stage),
      secs: totals.get(stage) ?? 0,
    })),
  };
}

// Apps are grouped by their display name (so activity mappings merge them)
// and ranked by time; the long tail folds into "Other".
function pcLaneView(
  lane: TimelineLane,
  mapName: (name: string) => string,
): LaneView {
  const named = lane.segments.map((s) => ({ ...s, name: mapName(s.label) }));
  const ranked = [...secsBy(named, (s) => s.name)].sort((a, b) => b[1] - a[1]);
  const colored = ranked.slice(0, APP_COLORS.length - 1);
  const colorOf = new Map(colored.map(([name], i) => [name, APP_COLORS[i]]));
  const otherSecs = ranked
    .slice(colored.length)
    .reduce((sum, [, secs]) => sum + secs, 0);

  return {
    key: lane.key,
    title: "PC",
    icon: Monitor,
    totalSecs: lane.total_secs,
    segments: named.map((s) => ({
      ...s,
      rgb: colorOf.get(s.name) ?? OTHER_RGB,
    })),
    legend: [
      ...colored.map(([name, secs]) => ({
        label: name,
        rgb: colorOf.get(name) ?? OTHER_RGB,
        secs,
      })),
      ...(otherSecs > 0
        ? [{ label: "Other", rgb: OTHER_RGB, secs: otherSecs }]
        : []),
    ],
  };
}

function fmtClock(ts: number): string {
  return format(new Date(ts * 1000), "h:mm a");
}

function TimelinePage() {
  const today = new Date();
  const [date, setDate] = useState(today);
  const [source, setSource] = useState<string | null>(null);
  const { settings } = useSettings();
  const isCurrentDay = isSameDay(date, today);

  const mapName = (name: string) =>
    settings.activityMappings.find((m) => m.from && m.from === name)?.to ||
    name;

  const { data: sourcesData } = useQuery({
    ...listActivitySourcesV1ActivitySourcesGetOptions({ client }),
  });
  const sources = sourcesData?.sources ?? [];

  const [startTs, endTs] = localDayBounds(date);
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

  const laneViews: Record<TimelineLaneKey, (lane: TimelineLane) => LaneView> =
    {
      sleep: sleepLaneView,
      pc: (lane) => pcLaneView(lane, mapName),
    };
  const lanes = timeline?.lanes.map((lane) => laneViews[lane.key](lane)) ?? [];
  const laneSecs = (key: TimelineLaneKey) =>
    lanes.find((l) => l.key === key)?.totalSecs ?? 0;

  const nowTs = Math.floor(Date.now() / 1000);
  const elapsedSecs = Math.max(0, Math.min(nowTs, endTs) - startTs);
  const untrackedSecs = timeline
    ? Math.max(0, elapsedSecs - timeline.tracked_secs)
    : null;

  return (
    <div className="space-y-5">
      <PageToolbar description="Where the day went — sleep and time at the computer.">
        {sources.length > 1 && (
          <Select
            value={source ?? timeline?.source ?? ""}
            onValueChange={(v) => setSource(v)}
          >
            <SelectTrigger className="h-8 w-44 min-w-0 rounded-lg border-white/10 bg-white/[0.04] text-13">
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
        {!isCurrentDay && (
          <SoftButton onClick={() => setDate(today)}>Today</SoftButton>
        )}
        <PeriodNav
          label={isCurrentDay ? "Today" : format(date, "EEE, MMM d, yyyy")}
          onPrev={() => setDate((d) => subDays(d, 1))}
          onNext={() => setDate((d) => addDays(d, 1))}
          nextDisabled={isCurrentDay}
        />
      </PageToolbar>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
        <StatTile
          label="Sleep"
          value={timeline ? fmtDur(laneSecs("sleep")) : "—"}
        />
        <StatTile
          label="PC"
          value={timeline ? fmtDur(laneSecs("pc")) : "—"}
          hint={timeline?.source ?? undefined}
        />
        <StatTile
          label="Untracked"
          value={untrackedSecs !== null ? fmtDur(untrackedSecs) : "—"}
          hint={isCurrentDay ? "So far today" : undefined}
        />
      </div>

      <section>
        <SectionLabel>Day</SectionLabel>
        <div className="space-y-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
          {isLoading && !timeline ? (
            ["sleep", "pc"].map((key) => (
              <Skeleton key={key} className="h-12 w-full bg-white/[0.06]" />
            ))
          ) : (
            <>
              <HourAxis date={date} startTs={startTs} endTs={endTs} />
              {lanes.map((lane) => (
                <Lane
                  key={lane.key}
                  lane={lane}
                  startTs={startTs}
                  endTs={endTs}
                  nowTs={isCurrentDay ? nowTs : null}
                />
              ))}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function pctOf(ts: number, startTs: number, endTs: number): number {
  return ((ts - startTs) / (endTs - startTs)) * 100;
}

// Ticks come from local wall-clock hours rather than fixed fractions so
// 23h/25h DST days still line up with the segments.
function HourAxis({
  date,
  startTs,
  endTs,
}: {
  date: Date;
  startTs: number;
  endTs: number;
}) {
  return (
    <div className="relative h-3 select-none">
      {AXIS_HOURS.map((hour) => {
        const tick = new Date(
          date.getFullYear(),
          date.getMonth(),
          date.getDate(),
          hour,
        );
        const pct = pctOf(tick.getTime() / 1000, startTs, endTs);
        return (
          <span
            key={hour}
            className="absolute text-10 leading-none tabular-nums text-white/35"
            style={{
              left: `${pct}%`,
              transform:
                hour === 0
                  ? "none"
                  : hour === 24
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {format(tick, "ha").toLowerCase()}
          </span>
        );
      })}
    </div>
  );
}

function Lane({
  lane,
  startTs,
  endTs,
  nowTs,
}: {
  lane: LaneView;
  startTs: number;
  endTs: number;
  nowTs: number | null;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const hoveredSegment = hovered !== null ? lane.segments[hovered] : null;
  const Icon = lane.icon;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-12">
        <Icon className="size-3.5 shrink-0 text-white/45" />
        <span className="font-medium text-white/80">{lane.title}</span>
        <span className="ml-auto tabular-nums text-white/50">
          {lane.segments.length > 0 ? fmtDur(lane.totalSecs) : "No data"}
        </span>
      </div>

      <div className="relative">
        <div className="relative h-6 w-full overflow-hidden rounded-md bg-white/[0.04]">
          {[25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="absolute inset-y-0 w-px bg-white/[0.06]"
              style={{ left: `${pct}%` }}
            />
          ))}
          {lane.segments.map((seg, i) => (
            <div
              key={`${seg.start_ts}-${seg.end_ts}-${seg.label}`}
              className="absolute inset-y-0 min-w-[2px] transition-opacity duration-150"
              style={{
                left: `${pctOf(seg.start_ts, startTs, endTs)}%`,
                width: `${pctOf(seg.end_ts, startTs, endTs) - pctOf(seg.start_ts, startTs, endTs)}%`,
                background: `rgb(${seg.rgb} / 0.85)`,
                opacity: hovered === null || hovered === i ? 1 : 0.45,
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          {nowTs !== null && nowTs < endTs && (
            <div
              className="pointer-events-none absolute inset-y-0 w-px bg-white/60"
              style={{ left: `${pctOf(nowTs, startTs, endTs)}%` }}
            />
          )}
        </div>

        {hoveredSegment && (
          <div
            className="pointer-events-none absolute bottom-full z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-white/10 bg-popover px-2 py-1 text-11 tabular-nums text-white/85 shadow-lg"
            style={{
              left: `${Math.min(
                Math.max(
                  pctOf(
                    (hoveredSegment.start_ts + hoveredSegment.end_ts) / 2,
                    startTs,
                    endTs,
                  ),
                  8,
                ),
                92,
              )}%`,
            }}
          >
            <span className="font-medium">{hoveredSegment.name}</span>
            <span className="text-white/50">
              {" · "}
              {fmtClock(hoveredSegment.start_ts)} –{" "}
              {fmtClock(hoveredSegment.end_ts)} ·{" "}
              {fmtDur(hoveredSegment.end_ts - hoveredSegment.start_ts)}
            </span>
          </div>
        )}
      </div>

      {lane.legend.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {lane.legend.map((item) => (
            <span
              key={item.label}
              className="flex items-center gap-1.5 text-11 text-white/55"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: `rgb(${item.rgb})` }}
              />
              {item.label}
              <span className="tabular-nums text-white/35">
                {fmtDur(item.secs)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
