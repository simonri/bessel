import type { CurrencySummary } from "@bessel/client";
import { transactionSummaryV1TransactionsSummaryGetOptions } from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarRow, Panel, SectionLabel, StatTile } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const INCOME = "var(--color-income)";
const SPENDING = "var(--color-primary-400)";
const TICK = { fill: "rgb(255 255 255 / 0.38)", fontSize: 11 };

export interface MonthSummaryActions {
  onPickMonth: (year: number, month: number) => void;
  onPickCategory: (categoryId: string | null) => void;
  onPickMerchant: (description: string) => void;
  onShowTransfers: () => void;
}

function whole(minor: number, currency: string): string {
  return formatMoney(Math.round(minor / 100) * 100, currency).replace(
    /,00(?= )/,
    "",
  );
}

/** "12% more than usual", against the average of the six months before. */
export function versusUsual(value: number, usual: number): string | null {
  if (usual <= 0) return null;
  const change = Math.round(((value - usual) / usual) * 100);
  if (change === 0) return "Same as usual";
  return `${Math.abs(change)}% ${change > 0 ? "more" : "less"} than usual`;
}

function MonthBars({
  summary,
  onPickMonth,
}: {
  summary: CurrencySummary;
  onPickMonth: (year: number, month: number) => void;
}) {
  const data = summary.months.map((m) => ({
    ...m,
    label: format(new Date(m.year, m.month - 1, 1), "MMM"),
    current:
      m.year === summary.months.at(-1)?.year &&
      m.month === summary.months.at(-1)?.month,
  }));
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer>
        <BarChart
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barGap={2}
          onClick={(state) => {
            const point = data[Number(state?.activeTooltipIndex)];
            if (point) onPickMonth(point.year, point.month);
          }}
        >
          <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 0.05)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={TICK}
            tickMargin={6}
          />
          <YAxis
            tickFormatter={(v: number) => `${Math.round(v / 100_000)}k`}
            tickLine={false}
            axisLine={false}
            width={36}
            tick={TICK}
          />
          <Tooltip
            cursor={{ fill: "rgb(255 255 255 / 0.04)" }}
            content={({ active, payload }) => {
              const point = payload?.[0]?.payload as
                | (typeof data)[number]
                | undefined;
              if (!active || !point) return null;
              return (
                <div className="rounded-lg border border-white/10 bg-neutral-900/95 px-3 py-2 text-12 shadow-lg">
                  <p className="font-medium text-white/85">
                    {format(
                      new Date(point.year, point.month - 1, 1),
                      "MMMM yyyy",
                    )}
                  </p>
                  <p className="text-white/60">
                    In {whole(point.income, summary.currency)}
                  </p>
                  <p className="text-white/60">
                    Out {whole(point.spending, summary.currency)}
                  </p>
                </div>
              );
            }}
          />
          <Bar
            dataKey="income"
            fill={INCOME}
            radius={[4, 4, 0, 0]}
            maxBarSize={14}
            className="cursor-pointer"
          />
          <Bar
            dataKey="spending"
            fill={SPENDING}
            radius={[4, 4, 0, 0]}
            maxBarSize={14}
            className="cursor-pointer"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Breakdown({
  summary,
  actions,
}: {
  summary: CurrencySummary;
  actions: MonthSummaryActions;
}) {
  const topCategory = summary.categories[0]?.total ?? 0;
  const topMerchant = summary.merchants[0]?.total ?? 0;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section>
        <SectionLabel>Where it went</SectionLabel>
        <Panel className="space-y-1 divide-y-0 px-2 py-2">
          {summary.categories.length === 0 && (
            <p className="px-2 py-1.5 text-12 text-white/40">
              No spending this month.
            </p>
          )}
          {summary.categories.map((category) => (
            <button
              key={category.category_id ?? "uncategorized"}
              type="button"
              onClick={() =>
                actions.onPickCategory(category.category_id ?? null)
              }
              className="block w-full rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.05]"
            >
              <BarRow
                label={category.name}
                fraction={topCategory > 0 ? category.total / topCategory : 0}
                value={whole(category.total, summary.currency)}
                detail={`${category.count}`}
                color={
                  category.category_id
                    ? category.color
                    : "rgb(255 255 255 / 0.25)"
                }
              />
            </button>
          ))}
        </Panel>
      </section>
      <section>
        <SectionLabel>Biggest spending</SectionLabel>
        <Panel className="space-y-1 divide-y-0 px-2 py-2">
          {summary.merchants.length === 0 && (
            <p className="px-2 py-1.5 text-12 text-white/40">
              No spending this month.
            </p>
          )}
          {summary.merchants.map((merchant) => (
            <button
              key={merchant.description}
              type="button"
              onClick={() => actions.onPickMerchant(merchant.description)}
              className="block w-full rounded-md px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.05]"
            >
              <BarRow
                label={merchant.description}
                fraction={topMerchant > 0 ? merchant.total / topMerchant : 0}
                value={whole(merchant.total, summary.currency)}
                detail={`${merchant.count}×`}
              />
            </button>
          ))}
        </Panel>
      </section>
    </div>
  );
}

/** What a month's own money did: in, out, against usual, where it went. Transfers and company money stay out. */
export function MonthSummary({
  year,
  month,
  actions,
}: {
  year: number;
  month: number;
  actions: MonthSummaryActions;
}) {
  const { data, isLoading } = useQuery({
    ...transactionSummaryV1TransactionsSummaryGetOptions({
      client,
      query: { year, month },
    }),
    placeholderData: keepPreviousData,
  });
  const [picked, setPicked] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
        {["in", "out", "net"].map((key) => (
          <Skeleton
            key={key}
            className="h-[4.25rem] rounded-xl bg-white/[0.06]"
          />
        ))}
      </div>
    );
  }
  if (data.currencies.length === 0) return null;
  const summary =
    data.currencies.find((c) => c.currency === picked) ?? data.currencies[0];
  const net = summary.net;

  return (
    <div className="space-y-4">
      {data.currencies.length > 1 && (
        <div className="flex gap-1" role="tablist" aria-label="Currency">
          {data.currencies.map((c) => (
            <button
              key={c.currency}
              type="button"
              role="tab"
              aria-selected={c.currency === summary.currency}
              onClick={() => setPicked(c.currency)}
              className={cn(
                "rounded-md px-2.5 py-1 text-12 font-medium transition-colors duration-150",
                c.currency === summary.currency
                  ? "bg-white/10 text-white/90"
                  : "text-white/45 hover:text-white/80",
              )}
            >
              {c.currency}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
        <StatTile
          label="Money in"
          value={whole(summary.income, summary.currency)}
          hint={
            versusUsual(summary.income, summary.average_income) ??
            "Salary, Swish and other income"
          }
        />
        <StatTile
          label="Money out"
          value={whole(summary.spending, summary.currency)}
          hint={
            versusUsual(summary.spending, summary.average_spending) ??
            "Spending, less refunds"
          }
        />
        <StatTile
          label={net >= 0 ? "Saved" : "Overspent"}
          value={
            <span className={net >= 0 ? "text-income" : "text-expense"}>
              {whole(Math.abs(net), summary.currency)}
            </span>
          }
          hint={`Usually ${whole(summary.average_income - summary.average_spending, summary.currency)}`}
        />
      </div>

      <Panel className="divide-y-0 px-4 pt-3 pb-2">
        <div className="mb-1 flex items-center justify-between gap-3">
          <p className="text-12 text-white/55">The last 12 months</p>
          <div className="flex items-center gap-3 text-11 text-white/50">
            <span className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm"
                style={{ background: INCOME }}
              />
              Money in
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-sm"
                style={{ background: SPENDING }}
              />
              Money out
            </span>
          </div>
        </div>
        <MonthBars summary={summary} onPickMonth={actions.onPickMonth} />
      </Panel>

      <Breakdown summary={summary} actions={actions} />

      {(data.uncategorized > 0 || data.transfers > 0) && (
        <p className="text-12 text-white/45">
          {data.uncategorized > 0 && (
            <button
              type="button"
              onClick={() => actions.onPickCategory(null)}
              className="underline underline-offset-2 hover:text-white/80"
            >
              {data.uncategorized} without a category
            </button>
          )}
          {data.uncategorized > 0 && data.transfers > 0 && " - "}
          {data.transfers > 0 && (
            <button
              type="button"
              onClick={actions.onShowTransfers}
              className="underline underline-offset-2 hover:text-white/80"
            >
              {data.transfers} moves between your own accounts left out
            </button>
          )}
        </p>
      )}
    </div>
  );
}
