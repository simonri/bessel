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
import { client } from "@/lib/client";
import { fmtDur, localDayBounds } from "./-activity-utils";

export const Route = createFileRoute("/_app/timeline")({
  component: TimelinePage,
});

const AXIS_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

interface LaneView {
  key: TimelineLaneKey;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  totalSecs: number;
  segments: (TimelineSegment & { name: string; rgb: string })[];
}

// Each lane is one bar: segments closer than a minute apart merge into a
// single session, whatever stage or app it was.
const MERGE_GAP_SECS = 60;
const LANES: Record<
  TimelineLaneKey,
  Pick<LaneView, "title" | "icon"> & { rgb: string }
> = {
  sleep: { title: "Sleep", icon: Moon, rgb: "147 131 250" },
  pc: { title: "PC", icon: Monitor, rgb: "96 165 250" },
};

function laneView(lane: TimelineLane): LaneView {
  const { title, icon, rgb } = LANES[lane.key];
  const sessions: LaneView["segments"] = [];
  for (const s of [...lane.segments].sort((a, b) => a.start_ts - b.start_ts)) {
    const last = sessions.at(-1);
    if (last && s.start_ts - last.end_ts <= MERGE_GAP_SECS) {
      last.end_ts = Math.max(last.end_ts, s.end_ts);
    } else {
      sessions.push({ ...s, label: title, name: title, rgb });
    }
  }
  return {
    key: lane.key,
    title,
    icon,
    totalSecs: lane.total_secs,
    segments: sessions,
  };
}

function fmtClock(ts: number): string {
  return format(new Date(ts * 1000), "h:mm a");
}

function TimelinePage() {
  const today = new Date();
  const [date, setDate] = useState(today);
  const [source, setSource] = useState<string | null>(null);
  const isCurrentDay = isSameDay(date, today);

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

  const lanes = timeline?.lanes.map(laneView) ?? [];
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
              {lanes.map((lane, i) => (
                <Lane
                  key={lane.key}
                  lane={lane}
                  nowBadge={i === 0}
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
  nowBadge,
}: {
  lane: LaneView;
  nowBadge: boolean;
  startTs: number;
  endTs: number;
  nowTs: number | null;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const hoveredSegment = hovered !== null ? lane.segments[hovered] : null;
  const Icon = lane.icon;
  const nowPct =
    nowTs !== null && nowTs < endTs ? pctOf(nowTs, startTs, endTs) : null;

  return (
    <div>
      <div className="relative mb-1.5 flex items-center gap-2 text-12">
        <Icon className="size-3.5 shrink-0 text-white/45" />
        <span className="font-medium text-white/80">{lane.title}</span>
        <span className="ml-auto tabular-nums text-white/50">
          {lane.segments.length > 0 ? fmtDur(lane.totalSecs) : "No data"}
        </span>
        {nowBadge && nowPct !== null && (
          <span
            className="pointer-events-none absolute top-1/2 rounded-full bg-red-500 px-1.5 text-10 font-semibold leading-4 text-white"
            style={{
              left: `${Math.min(Math.max(nowPct, 2), 98)}%`,
              transform: "translate(-50%, -50%)",
            }}
          >
            Now
          </span>
        )}
      </div>

      <div className="relative">
        <div className="relative h-6 w-full overflow-hidden rounded-md bg-white/[0.04]">
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
          {nowPct !== null && (
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-red-500"
              style={{ left: `${nowPct}%` }}
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
              {" - "}
              {fmtClock(hoveredSegment.start_ts)} –{" "}
              {fmtClock(hoveredSegment.end_ts)} -{" "}
              {fmtDur(hoveredSegment.end_ts - hoveredSegment.start_ts)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
