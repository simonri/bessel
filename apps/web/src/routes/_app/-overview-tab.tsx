import type {
  AllocationSlice,
  CurrencyAllocation,
  InvestmentAccountSummary,
  PeriodReturns,
  PortfolioSeries,
  ValuePoint,
} from "@bessel/client";
import {
  getInvestmentAccountsOptions,
  getInvestmentAllocationOptions,
  getInvestmentPerformanceOptions,
} from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import {
  differenceInCalendarDays,
  format,
  startOfDay,
  subMonths,
  subYears,
} from "date-fns";
import { TrendingUp } from "lucide-react";
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
import { EmptyState, Panel } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { fromApiDate } from "@/lib/local-day";
import { formatAxisKr } from "@/lib/money";
import { Amount, useAmountsHidden } from "@/lib/privacy";
import { cn } from "@/lib/utils";

export const RANGES = [
  { key: "1m", label: "1M" },
  { key: "3m", label: "3M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1Y" },
  { key: "all", label: "All" },
] as const;
export type Range = (typeof RANGES)[number]["key"];

const LINE = "var(--color-primary-400)";
const TICK = { fill: "rgb(255 255 255 / 0.38)", fontSize: 11 };
const NEUTRAL = "rgb(255 255 255 / 0.28)";
// The dark categorical steps, in the order checked for telling neighbours apart
// (validate_palette.js --mode dark --surface #161616): blue, orange, aqua,
// yellow, magenta, green, violet, red.
const CATEGORICAL = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];
// Each asset type keeps its colour whatever else is held; cash is money not yet in anything, so it's neutral.
const ASSET_COLORS: Record<string, string> = {
  stock: CATEGORICAL[0],
  mutual_fund: CATEGORICAL[1],
  etf: CATEGORICAL[2],
  bond: CATEGORICAL[3],
  crypto: CATEGORICAL[4],
  real_estate: CATEGORICAL[5],
  other: CATEGORICAL[6],
  cash: NEUTRAL,
};

/** An account's colour follows the account, by where it is in the list, not by its size. */
export function accountColors(
  accounts: { bank_account_id: string }[],
): Map<string, string> {
  return new Map(
    accounts.map((a, i) => [a.bank_account_id, CATEGORICAL[i] ?? NEUTRAL]),
  );
}

/** A return as a signed percent with a decimal comma, like the rest of the page. */
export function formatReturn(fraction: number): string {
  const text = (Math.abs(fraction) * 100).toFixed(1);
  const sign = Number(text) === 0 ? "" : fraction > 0 ? "+" : "-";
  return `${sign}${text.replace(".", ",")}%`;
}

function rangeStart(range: Range, today: Date): Date | null {
  const day = startOfDay(today);
  if (range === "1m") return subMonths(day, 1);
  if (range === "3m") return subMonths(day, 3);
  if (range === "ytd") return new Date(day.getFullYear() - 1, 11, 31);
  if (range === "1y") return subYears(day, 1);
  return null;
}

export interface ChartPoint {
  time: number;
  value: number;
}

/**
 * The values from the day the returns are measured from, so the line and the
 * percentages cover the same days. Without returns, from the range's start.
 */
export function pointsFrom(
  points: ValuePoint[],
  start: Date | null,
): ChartPoint[] {
  return points
    .map((p) => ({ time: fromApiDate(p.day).getTime(), value: p.value }))
    .filter((p) => !start || p.time >= start.getTime());
}

export function returnsFor(
  returns: PeriodReturns[],
  accountId: string | null,
  currency: string,
  range: Range,
): PeriodReturns | undefined {
  return returns.find(
    (r) =>
      r.bank_account_id === accountId &&
      r.currency === currency &&
      r.range === range,
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

function ValueChart({
  data,
  currency,
}: {
  data: ChartPoint[];
  currency: string;
}) {
  const gradientId = `portfolio-fill-${useId().replace(/[^\w-]/g, "")}`;
  const hidden = useAmountsHidden();
  if (data.length < 2) {
    return (
      <p className="mt-6 mb-2 type-caption text-white/40">
        The chart fills in as your broker reports what you hold, from the first
        sync on.
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
              <stop offset="0%" stopColor={LINE} stopOpacity={0.2} />
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
          <Area
            type="linear"
            dataKey="value"
            stroke={LINE}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
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

function ReturnFigure({
  label,
  explain,
  value,
  perYear,
  unavailable,
}: {
  label: string;
  explain: string;
  value: number | null | undefined;
  perYear: number | null | undefined;
  unavailable: string | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="type-caption text-white/50">{label}</p>
      {value != null ? (
        <>
          <p
            className={cn(
              "mt-0.5 type-metric",
              value >= 0 ? "text-income" : "text-expense",
            )}
          >
            {formatReturn(value)}
          </p>
          <p className="type-caption text-white/40">
            {perYear != null && formatReturn(perYear) !== formatReturn(value)
              ? `${formatReturn(perYear)} a year - ${explain}`
              : explain}
          </p>
        </>
      ) : (
        <>
          <p className="mt-0.5 type-metric text-white/35">-</p>
          <p className="type-caption text-white/40">
            {unavailable ?? "Not available"}
          </p>
        </>
      )}
    </div>
  );
}

function PerformancePanel({
  name,
  currency,
  series,
  returns,
  range,
  onRange,
  leftOut,
}: {
  name: string;
  currency: string;
  series: PortfolioSeries | undefined;
  returns: PeriodReturns | undefined;
  range: Range;
  onRange: (range: Range) => void;
  leftOut: { name: string; reason: string }[];
}) {
  const start = returns?.start
    ? fromApiDate(returns.start)
    : rangeStart(range, new Date());
  const data = pointsFrom(series?.points ?? [], start);
  const latest = series?.points.at(-1);
  return (
    <Panel className="divide-y-0 p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="type-label text-white/55">{name}</p>
        <RangePicker value={range} onChange={onRange} />
      </div>
      {latest ? (
        <Amount
          value={latest.value}
          currency={currency}
          className="mt-1 block type-display text-white"
        />
      ) : (
        <p className="mt-1 type-display text-white/35">-</p>
      )}
      <p className="mt-1.5 type-caption text-white/40">
        {returns?.gain != null && returns.start && returns.end ? (
          <>
            <Amount
              value={returns.gain}
              currency={currency}
              sign
              className={cn(
                "font-medium",
                returns.gain >= 0 ? "text-income" : "text-expense",
              )}
            />{" "}
            made from {format(fromApiDate(returns.start), "d MMM yyyy")} to{" "}
            {format(fromApiDate(returns.end), "d MMM yyyy")}, deposits and
            withdrawals left out
          </>
        ) : (
          "Holdings plus cash, separate from net worth"
        )}
      </p>
      <ValueChart data={data} currency={currency} />
      {returns?.time_weighted == null &&
      returns?.money_weighted == null &&
      returns?.time_weighted_unavailable ===
        returns?.money_weighted_unavailable ? (
        <div className="mt-5">
          <ReturnFigure
            label="Returns"
            explain=""
            value={null}
            perYear={null}
            unavailable={returns?.time_weighted_unavailable}
          />
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 @md:grid-cols-2">
          <ReturnFigure
            label="Time-weighted return"
            explain="how the investments did"
            value={returns?.time_weighted}
            perYear={returns?.time_weighted_annualized}
            unavailable={returns?.time_weighted_unavailable}
          />
          <ReturnFigure
            label="Money-weighted return"
            explain="how your money did, timing included"
            value={returns?.money_weighted}
            perYear={returns?.money_weighted_annualized}
            unavailable={returns?.money_weighted_unavailable}
          />
        </div>
      )}
      {leftOut.map((l) => (
        <p key={l.name} className="mt-4 type-caption text-white/40">
          Returns leave out {l.name}. {l.reason}
        </p>
      ))}
    </Panel>
  );
}

function AccountReturns({
  accounts,
  returns,
  currency,
  range,
  scope,
  onScope,
}: {
  accounts: InvestmentAccountSummary[];
  returns: PeriodReturns[];
  currency: string;
  range: Range;
  scope: string | null;
  onScope: (id: string | null) => void;
}) {
  const rows = [
    { id: null, name: "All accounts" },
    ...accounts.map((a) => ({ id: a.bank_account_id, name: a.name })),
  ];
  return (
    <Panel className="divide-y-0 p-3">
      <div className="flex items-baseline justify-between gap-3 px-2 pt-2 pb-1">
        <p className="type-label text-white/55">Returns by account</p>
        <p className="type-caption text-white/40">Time - money weighted</p>
      </div>
      <ul>
        {rows.map((row) => {
          const found = returnsFor(returns, row.id, currency, range);
          const picked = scope === row.id;
          return (
            <li key={row.id ?? "all"}>
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => onScope(row.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-150",
                  picked ? "bg-white/[0.07]" : "hover:bg-white/[0.04]",
                )}
              >
                <span className="min-w-0 flex-1 truncate text-13 font-medium text-white/85">
                  {row.name}
                </span>
                <span
                  className="shrink-0 text-right text-13 tabular-nums text-white/70"
                  title={
                    found?.time_weighted_unavailable ??
                    found?.money_weighted_unavailable ??
                    undefined
                  }
                >
                  {found?.time_weighted == null &&
                  found?.money_weighted == null ? (
                    <span className="text-white/40">Not available</span>
                  ) : (
                    <>
                      {found.time_weighted != null
                        ? formatReturn(found.time_weighted)
                        : "-"}
                      <span className="text-white/30"> - </span>
                      {found.money_weighted != null
                        ? formatReturn(found.money_weighted)
                        : "-"}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function SegmentedBar({
  slices,
  color,
  currency,
  label,
}: {
  slices: AllocationSlice[];
  color: (slice: AllocationSlice) => string;
  currency: string;
  label: string;
}) {
  if (slices.length === 0) return null;
  return (
    <section aria-label={label} className="mt-4 first:mt-0">
      <p className="mb-2 type-caption text-white/45">{label}</p>
      {/* A 2px gap in the surface colour separates the parts. */}
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {slices.map((slice) => (
          <span
            key={slice.key}
            title={`${slice.label} ${formatShare(slice.share)}`}
            className="h-full"
            style={{
              width: `${slice.share * 100}%`,
              backgroundColor: color(slice),
            }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2 text-12">
            <span
              aria-hidden
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color(slice) }}
            />
            <span className="min-w-0 flex-1 truncate text-white/75">
              {slice.label}
            </span>
            <span className="shrink-0 tabular-nums text-white/45">
              {formatShare(slice.share)}
            </span>
            <Amount
              value={slice.value}
              currency={currency}
              className="w-24 shrink-0 text-right tabular-nums text-white/75"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function formatShare(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function AllocationPanel({
  allocation,
  colors,
}: {
  allocation: CurrencyAllocation;
  colors: Map<string, string>;
}) {
  const { currency } = allocation;
  return (
    <Panel className="divide-y-0 p-5">
      <p className="mb-3 type-label text-white/55">What it's in</p>
      <SegmentedBar
        label="By type"
        slices={allocation.by_asset_type}
        color={(s) => ASSET_COLORS[s.key] ?? NEUTRAL}
        currency={currency}
      />
      <SegmentedBar
        label="By account"
        slices={allocation.by_account}
        color={(s) => colors.get(s.key) ?? NEUTRAL}
        currency={currency}
      />
      {(allocation.borrowed < 0 || allocation.unpriced > 0) && (
        <p className="mt-4 type-caption text-white/40">
          {allocation.borrowed < 0 && (
            <>
              Borrowed{" "}
              <Amount value={-allocation.borrowed} currency={currency} />, not
              in the shares.{" "}
            </>
          )}
          {allocation.unpriced > 0 &&
            `${allocation.unpriced} ${allocation.unpriced === 1 ? "holding has" : "holdings have"} no price and aren't counted.`}
        </p>
      )}
    </Panel>
  );
}

export function OverviewTab() {
  const { data: performance, isLoading: performanceLoading } = useQuery(
    getInvestmentPerformanceOptions({ client }),
  );
  const { data: allocationData, isLoading: allocationLoading } = useQuery(
    getInvestmentAllocationOptions({ client }),
  );
  const { data: accountsData, isLoading: accountsLoading } = useQuery(
    getInvestmentAccountsOptions({ client }),
  );
  const [range, setRange] = useState<Range>("1y");
  const [scope, setScope] = useState<string | null>(null);
  const [pickedCurrency, setCurrency] = useState<string | null>(null);

  if (performanceLoading || allocationLoading || accountsLoading) {
    return (
      <div className="grid gap-4 @4xl:grid-cols-3">
        <Skeleton className="h-96 rounded-xl bg-white/[0.06] @4xl:col-span-2" />
        <Skeleton className="h-64 rounded-xl bg-white/[0.06]" />
      </div>
    );
  }

  const accounts = accountsData?.items ?? [];
  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp />}
        title="No investment accounts yet"
        className="py-12"
      >
        <p>Add a broker on the Accounts page to see how it's doing here.</p>
      </EmptyState>
    );
  }

  const currencies = [...new Set(accounts.map((a) => a.currency))].sort();
  const scoped = accounts.find((a) => a.bank_account_id === scope);
  const currency = scoped?.currency ?? pickedCurrency ?? currencies[0];
  const inCurrency = accounts.filter((a) => a.currency === currency);
  const series = performance?.series.find(
    (s) =>
      s.bank_account_id === (scoped ? scope : null) && s.currency === currency,
  );
  const returns = returnsFor(
    performance?.returns ?? [],
    scoped ? scope : null,
    currency,
    range,
  );
  const leftOut = scoped
    ? []
    : (performance?.left_out ?? []).filter((l) =>
        inCurrency.some((a) => a.bank_account_id === l.bank_account_id),
      );
  const allocation = allocationData?.items.find((a) => a.currency === currency);

  return (
    <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-3">
      <div className="min-w-0 space-y-4 @4xl:col-span-2">
        {currencies.length > 1 && (
          <fieldset className="flex w-fit rounded-lg border-0 bg-white/[0.05] p-0.5">
            <legend className="sr-only">Currency</legend>
            {currencies.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === currency}
                onClick={() => {
                  setCurrency(c);
                  setScope(null);
                }}
                className={cn(
                  "h-7 rounded-md px-2.5 text-12 font-medium transition-colors duration-150",
                  c === currency
                    ? "bg-white/[0.1] text-white/90"
                    : "text-white/45 hover:text-white/75",
                )}
              >
                {c}
              </button>
            ))}
          </fieldset>
        )}
        <PerformancePanel
          name={
            scoped?.name ??
            (inCurrency.some((a) => a.is_business)
              ? "Yours and your company's"
              : "All your investments")
          }
          currency={currency}
          series={series}
          returns={returns}
          range={range}
          onRange={setRange}
          leftOut={leftOut}
        />
        <AccountReturns
          accounts={inCurrency}
          returns={performance?.returns ?? []}
          currency={currency}
          range={range}
          scope={scope}
          onScope={setScope}
        />
      </div>
      <div className="min-w-0 @4xl:sticky @4xl:top-4">
        {allocation && (
          <AllocationPanel
            allocation={allocation}
            colors={accountColors(inCurrency)}
          />
        )}
      </div>
    </div>
  );
}
