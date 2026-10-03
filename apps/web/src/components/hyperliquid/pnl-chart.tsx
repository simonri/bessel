import { useId } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Point, Range } from "@/lib/hyperliquid";
import { cn } from "@/lib/utils";
import {
  axisUsdFormatter,
  formatSignedUsd,
  formatTick,
  formatTime,
  pnlTone,
  timeTicks,
  valueAxis,
} from "@/routes/_app/-hyperliquid-format";

const LINE = "var(--color-primary-400)";
const TICK = { fill: "rgb(255 255 255 / 0.38)", fontSize: 11 };

export function PnlChart({ points, range }: { points: Point[]; range: Range }) {
  // useId's colons aren't valid inside url(#…).
  const gradientId = `pnl-fill-${useId().replace(/[^\w-]/g, "")}`;
  if (points.length < 2) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-medium text-white/75">
          Nothing to chart yet
        </p>
        <p className="text-xs text-white/40">
          Try a longer range once there's some history.
        </p>
      </div>
    );
  }
  const axis = valueAxis(points.map((p) => p.value));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart
          data={points}
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LINE} stopOpacity={0.28} />
              <stop offset="100%" stopColor={LINE} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.05)" />
          <XAxis
            dataKey="ts"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            ticks={timeTicks(points[0].ts, points[points.length - 1].ts, range)}
            tickFormatter={(ts: number) => formatTick(ts, range)}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tick={TICK}
            tickMargin={8}
          />
          <YAxis
            dataKey="value"
            domain={axis.domain}
            ticks={axis.ticks}
            tickFormatter={axisUsdFormatter(axis.ticks)}
            tickLine={false}
            axisLine={false}
            width={64}
            tick={TICK}
          />
          <Tooltip
            cursor={{ stroke: "rgb(255 255 255 / 0.2)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as Point | undefined;
              if (!active || !point) return null;
              return (
                <div className="rounded-xl bg-popover px-3 py-2 text-11 shadow-xl ring-1 ring-white/10">
                  <p className="text-white/45">
                    {formatTime(point.ts, range, true)}
                  </p>
                  <p
                    className={cn(
                      "text-13 font-semibold tabular-nums",
                      pnlTone(point.value),
                    )}
                  >
                    {formatSignedUsd(point.value)}
                  </p>
                </div>
              );
            }}
          />
          <ReferenceLine
            y={0}
            stroke="rgb(255 255 255 / 0.2)"
            strokeDasharray="3 4"
          />
          <Area
            dataKey="value"
            type="stepAfter"
            baseValue={0}
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
