import { format } from "date-fns";
import { MapPin, Monitor, Moon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { fmtDur } from "@/routes/_app/-activity-utils";
import type { RibbonBlock, RibbonLane, RibbonLaneKey } from "./day-summary";
import { LANE_META } from "./day-summary";

const AXIS_STEPS = [0, 3, 6, 9, 12, 15, 18, 21, 24];
// Shaded as night behind the lanes: before 6am and from 10pm.
const NIGHT_BEFORE = 6;
const NIGHT_FROM = 22;
// Blocks narrower than this (% of the day) only get their name on hover.
const LABEL_MIN_PCT = 9;

const LANE_ICONS: Record<RibbonLaneKey, typeof Moon> = {
  sleep: Moon,
  pc: Monitor,
  places: MapPin,
};

function placesCount(lane: RibbonLane): string {
  const n = new Set(lane.blocks.map((b) => b.name)).size;
  return `${n} ${n === 1 ? "place" : "places"}`;
}

export function pastel(hue: number, alpha = 1): string {
  return `oklch(0.8 0.1 ${hue} / ${alpha})`;
}

function pctOf(ts: number, startTs: number, endTs: number): number {
  return ((ts - startTs) / (endTs - startTs)) * 100;
}

// Wall-clock hours rather than fixed fractions, so 23h/25h DST days still
// line up with the blocks.
function hourTs(date: Date, hour: number): number {
  return (
    new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hour,
    ).getTime() / 1000
  );
}

function fmtClock(ts: number): string {
  return format(new Date(ts * 1000), "h:mma").toLowerCase();
}

function Block({
  block,
  startTs,
  endTs,
  dimmed,
  showName,
  onHover,
}: {
  block: RibbonBlock;
  showName: boolean;
  startTs: number;
  endTs: number;
  dimmed: boolean;
  onHover: (block: RibbonBlock | null) => void;
}) {
  const left = pctOf(block.startTs, startTs, endTs);
  const width = pctOf(block.endTs, startTs, endTs) - left;
  return (
    <div
      onMouseEnter={() => onHover(block)}
      onMouseLeave={() => onHover(null)}
      className="absolute inset-y-0.5 flex min-w-[3px] items-center overflow-hidden px-2 shadow-[inset_-1px_0_0_rgb(0_0_0/0.45)] transition-[opacity,filter] duration-200 hover:brightness-110"
      style={{
        left: `${left}%`,
        width: `${width}%`,
        background: `linear-gradient(180deg, ${pastel(block.hue, 0.95)}, ${pastel(block.hue, 0.75)})`,
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      {showName && width >= LABEL_MIN_PCT && (
        <span
          className="truncate text-10 font-semibold"
          style={{ color: `oklch(0.3 0.06 ${block.hue})` }}
        >
          {block.name}
        </span>
      )}
    </div>
  );
}

function LaneLabel({ lane }: { lane: RibbonLane }) {
  const Icon = LANE_ICONS[lane.key];
  const { hue } = LANE_META[lane.key];
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className="flex size-6 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: pastel(hue, 0.16), color: pastel(hue) }}
      >
        <Icon className="size-3.5" />
      </span>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-xs font-medium text-white/80">
          {lane.title}
        </span>
        <span className="text-10 tabular-nums text-white/40">
          {lane.blocks.length === 0
            ? "Nothing yet"
            : lane.key === "places"
              ? placesCount(lane)
              : fmtDur(lane.totalSecs)}
        </span>
      </div>
    </div>
  );
}

/** The day left to right: one track per lane, with "now" on today. */
export function DayRibbon({
  date,
  lanes,
  startTs,
  endTs,
  nowTs,
}: {
  date: Date;
  lanes: RibbonLane[];
  startTs: number;
  endTs: number;
  nowTs: number | null;
}) {
  const [hovered, setHovered] = useState<RibbonBlock | null>(null);
  const nowPct =
    nowTs !== null && nowTs > startTs && nowTs < endTs
      ? pctOf(nowTs, startTs, endTs)
      : null;
  // The day can start after midnight; hourTs rolls hours past 23 over.
  const startHour = new Date(startTs * 1000).getHours();
  const axisHours = AXIS_STEPS.map((step) => startHour + step);
  const nightEndPct = Math.max(
    0,
    pctOf(hourTs(date, NIGHT_BEFORE), startTs, endTs),
  );
  const nightStartPct = pctOf(hourTs(date, NIGHT_FROM), startTs, endTs);

  return (
    <div className="grid grid-cols-[minmax(5.5rem,8rem)_1fr] items-center gap-x-4 gap-y-3">
      <span />
      <div className="relative h-4 select-none">
        {axisHours.map((hour, i) => {
          const pct = pctOf(hourTs(date, hour), startTs, endTs);
          // Make room for the "now" pill.
          if (nowPct !== null && Math.abs(pct - nowPct) < 4) return null;
          return (
            <span
              key={hour}
              className="absolute top-0 text-10 leading-none tabular-nums text-white/35"
              style={{
                left: `${pct}%`,
                transform:
                  i === 0
                    ? "none"
                    : i === axisHours.length - 1
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              {format(new Date(hourTs(date, hour) * 1000), "ha").toLowerCase()}
            </span>
          );
        })}
        {nowPct !== null && (
          <span
            className="absolute -top-0.5 z-10 -translate-x-1/2 rounded-full bg-primary-500 px-1.5 text-10 font-semibold leading-4 text-white shadow-sm"
            style={{ left: `${Math.min(Math.max(nowPct, 3), 97)}%` }}
          >
            now
          </span>
        )}
      </div>

      {lanes.map((lane) => (
        <LaneRow
          key={lane.key}
          lane={lane}
          startTs={startTs}
          endTs={endTs}
          nowPct={nowPct}
          nightEndPct={nightEndPct}
          nightStartPct={nightStartPct}
          hovered={hovered}
          onHover={setHovered}
        />
      ))}
    </div>
  );
}

function LaneRow({
  lane,
  startTs,
  endTs,
  nowPct,
  nightEndPct,
  nightStartPct,
  hovered,
  onHover,
}: {
  lane: RibbonLane;
  startTs: number;
  endTs: number;
  nowPct: number | null;
  nightEndPct: number;
  nightStartPct: number;
  hovered: RibbonBlock | null;
  onHover: (block: RibbonBlock | null) => void;
}) {
  const hoveredHere = hovered && lane.blocks.includes(hovered) ? hovered : null;
  return (
    <>
      <LaneLabel lane={lane} />
      <div className={cn("relative", hoveredHere && "z-20")}>
        <div
          data-lane-bar
          className="relative h-8 w-full overflow-hidden rounded-sm bg-white/[0.04] ring-1 ring-white/[0.05]"
        >
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 bg-white/[0.025]"
            style={{ width: `${nightEndPct}%` }}
          />
          <div
            aria-hidden
            className="absolute inset-y-0 right-0 bg-white/[0.025]"
            style={{ left: `${nightStartPct}%` }}
          />
          {lane.blocks.map((block) => (
            <Block
              key={`${block.startTs}-${block.endTs}-${block.name}`}
              block={block}
              startTs={startTs}
              endTs={endTs}
              dimmed={hoveredHere !== null && hoveredHere !== block}
              // Sleep and screen blocks would only repeat the lane's name.
              showName={lane.key === "places"}
              onHover={onHover}
            />
          ))}
          {nowPct !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full bg-primary-400/80"
              style={{ left: `${nowPct}%` }}
            />
          )}
        </div>
        {hoveredHere && (
          <div
            className="pointer-events-none absolute top-full z-30 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#1c1c1f] px-2.5 py-1 text-11 tabular-nums text-white/85 shadow-xl ring-1 ring-white/10"
            style={{
              left: `${Math.min(Math.max(pctOf((hoveredHere.startTs + hoveredHere.endTs) / 2, startTs, endTs), 10), 90)}%`,
            }}
          >
            <span className="font-medium">{hoveredHere.name}</span>
            <span className="text-white/50">
              {" - "}
              {fmtClock(hoveredHere.startTs)} to {fmtClock(hoveredHere.endTs)}
              {" - "}
              {fmtDur(hoveredHere.endTs - hoveredHere.startTs)}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
