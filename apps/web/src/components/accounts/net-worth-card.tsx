import type { NetWorthPoint } from "@bessel/client";
import {
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfMonth,
  subMonths,
  subYears,
} from "date-fns";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useId, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel } from "@/components/ui-kit";
import { formatAxisKr } from "@/lib/money";
import { Amount, useAmountsHidden } from "@/lib/privacy";
import { cn } from "@/lib/utils";

const LINE = "var(--color-primary-400)";
const TICK = { fill: "rgb(255 255 255 / 0.38)", fontSize: 11 };

export const RANGES = [
  { key: "3m", label: "3M" },
  { key: "1y", label: "1Y" },
  { key: "all", label: "All" },
] as const;
export type Range = (typeof RANGES)[number]["key"];

interface ChartPoint {
  time: number;
  value: number;
}

function rangeStart(range: Range, today: Date): Date | null {
  if (range === "3m") return subMonths(startOfDay(today), 3);
  if (range === "1y") return subYears(startOfDay(today), 1);
  return null;
}

/** What net worth was at the end of `day`: the last change on or before it. */
export function valueOn(points: NetWorthPoint[], day: Date): number | null {
  let value: number | null = null;
  for (const point of points) {
    if (startOfDay(point.day) > day) break;
    value = point.value;
  }
  return value;
}

/**
 * The points within the range. The line starts at the range's left edge with
 * the value it had then, so a quiet stretch doesn't look like missing data.
 */
export function pointsInRange(
  points: NetWorthPoint[],
  range: Range,
  today: Date,
): ChartPoint[] {
  const start = rangeStart(range, today);
  const inRange = points
    .filter((p) => !start || startOfDay(p.day) >= start)
    .map((p) => ({ time: startOfDay(p.day).getTime(), value: p.value }));
  if (!start) return inRange;
  const before = valueOn(points, start);
  if (before === null || inRange[0]?.time === start.getTime()) return inRange;
  return [{ time: start.getTime(), value: before }, ...inRange];
}

/** How much net worth moved since the end of last month, or null without history from before it. */
export function changeThisMonth(
  points: NetWorthPoint[],
  today: Date,
): number | null {
  const lastMonthEnd = new Date(startOfMonth(today).getTime() - 1);
  const before = valueOn(points, startOfDay(lastMonthEnd));
  const now = points.at(-1)?.value;
  if (before === null || now === undefined) return null;
  return now - before;
}

export function NetWorthCard({
  total,
  currency,
  points,
  hint,
}: {
  total: number;
  currency: string;
  points: NetWorthPoint[];
  hint: string;
}) {
  const [range, setRange] = useState<Range>("1y");
  const today = new Date();
  const change = changeThisMonth(points, today);
  const data = pointsInRange(points, range, today);
  return (
    <Panel className="divide-y-0 p-5">
      {/* The range sits on the label's line, so the big number has the width to itself. */}
      <div className="flex items-center justify-between gap-3">
        <p className="type-label text-white/55">Net worth</p>
        <RangePicker value={range} onChange={setRange} />
      </div>
      <Amount
        value={total}
        currency={currency}
        className="mt-1 block type-display text-white"
      />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 type-caption">
        {change !== null && <MonthChange change={change} currency={currency} />}
        <span className="text-white/40">{hint}</span>
      </div>
      <NetWorthChart data={data} currency={currency} />
    </Panel>
  );
}

function MonthChange({
  change,
  currency,
}: {
  change: number;
  currency: string;
}) {
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-medium",
        up
          ? "bg-emerald-400/10 text-emerald-300"
          : "bg-rose-400/10 text-rose-300",
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <Amount value={change} currency={currency} sign />
      <span className="font-normal opacity-80">this month</span>
    </span>
  );
}

function RangePicker({
  value,
  onChange,
}: {
  value: Range;
  onChange: (range: Range) => void;
}) {
  return (
    <fieldset className="flex shrink-0 rounded-lg border-0 bg-white/[0.05] p-0.5">
      <legend className="sr-only">Time range</legend>
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          aria-pressed={value === r.key}
          onClick={() => onChange(r.key)}
          className={cn(
            "h-7 rounded-md px-2.5 text-12 font-medium transition-colors duration-150",
            value === r.key
              ? "bg-white/[0.1] text-white/90"
              : "text-white/45 hover:text-white/75",
          )}
        >
          {r.label}
        </button>
      ))}
    </fieldset>
  );
}

function NetWorthChart({
  data,
  currency,
}: {
  data: ChartPoint[];
  currency: string;
}) {
  const gradientId = `net-worth-fill-${useId().replace(/[^\w-]/g, "")}`;
  const hidden = useAmountsHidden();
  if (data.length < 2) {
    return (
      <p className="mt-6 mb-2 type-caption text-white/40">
        The chart fills in as Bessel sees your balances change.
      </p>
    );
  }
  const first = data[0].time;
  const last = data[data.length - 1].time;
  const longRange = differenceInCalendarDays(last, first) > 400;
  return (
    <div className="mt-4 -mb-1 h-52 w-full">
      <ResponsiveContainer>
        <AreaChart
          data={data}
          margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={0.24} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.05)" />
          <XAxis
            dataKey="time"
            type="number"
            scale="time"
            domain={[first, last]}
            tickFormatter={(t: number) =>
              format(t, longRange ? "MMM yyyy" : "d MMM")
            }
            tickLine={false}
            axisLine={false}
            tick={TICK}
            tickMargin={6}
            minTickGap={40}
          />
          <YAxis
            domain={["auto", "auto"]}
            tickFormatter={(v: number) => (hidden ? "" : formatAxisKr(v))}
            tickLine={false}
            axisLine={false}
            width={hidden ? 8 : 44}
            tick={TICK}
          />
          <Tooltip
            cursor={{ stroke: "rgb(255 255 255 / 0.2)" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as ChartPoint | undefined;
              if (!active || !point) return null;
              return (
                <div className="rounded-lg border border-white/10 bg-neutral-900/95 px-3 py-2 text-12 shadow-lg">
                  <p className="font-medium text-white/85">
                    {format(point.time, "d MMM yyyy")}
                  </p>
                  <Amount
                    value={point.value}
                    currency={currency}
                    className="text-white/60"
                  />
                </div>
              );
            }}
          />
          {/* Stepped: a balance holds until the day it changes. */}
          <Area
            type="stepAfter"
            dataKey="value"
            stroke={LINE}
            strokeWidth={2}
            strokeLinejoin="round"
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
            activeDot={{
              r: 4.5,
              strokeWidth: 2,
              stroke: "var(--color-chrome)",
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
