import type {
  CurrencySummary,
  SummaryCategory,
  SummaryMerchant,
} from "@bessel/client";
import { getTransactionSummaryOptions } from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Tag } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Panel, SoftButton } from "@/components/ui-kit";
import { client } from "@/lib/client";
import { formatAxisKr } from "@/lib/money";
import { Amount, useAmountsHidden } from "@/lib/privacy";
import { cn } from "@/lib/utils";

const INCOME = "var(--color-income)";
const SPENDING = "var(--color-primary-400)";
const TICK = { fill: "rgb(255 255 255 / 0.38)", fontSize: 11 };
const TOP_CATEGORIES = 6;
const TOP_MERCHANTS = 5;

export interface MonthSummaryActions {
  onPickMonth: (year: number, month: number) => void;
  onPickCategory: (categoryId: string | null) => void;
  onPickMerchant: (description: string) => void;
  onShowTransfers: () => void;
}

/** "12% more than usual", against the average of the six months before. */
export function versusUsual(value: number, usual: number): string | null {
  if (usual <= 0) return null;
  const change = Math.round(((value - usual) / usual) * 100);
  if (change === 0) return "Same as usual";
  return `${Math.abs(change)}% ${change > 0 ? "more" : "less"} than usual`;
}

/** The biggest categories, with the rest added up so the list stays short. */
export function topCategories(
  categories: SummaryCategory[],
  limit = TOP_CATEGORIES,
): { shown: SummaryCategory[]; rest: number } {
  // A single leftover reads better by its own name than as "everything else".
  if (categories.length <= limit + 1) return { shown: categories, rest: 0 };
  return {
    shown: categories.slice(0, limit),
    rest: categories.slice(limit).reduce((sum, c) => sum + c.total, 0),
  };
}

function Figure({
  label,
  value,
  currency,
  hint,
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  hint: ReactNode;
  tone?: "good" | "bad";
}) {
  return (
    <div className="min-w-0">
      <p className="type-label text-white/55">{label}</p>
      <Amount
        value={value}
        currency={currency}
        compact
        className={cn(
          "mt-1 block type-metric",
          tone === "good" && "text-income",
          tone === "bad" && "text-expense",
          !tone && "text-white/90",
        )}
      />
      <p className="mt-0.5 line-clamp-2 type-caption text-white/40">{hint}</p>
    </div>
  );
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
  }));
  const picked = data.length - 1;
  const hidden = useAmountsHidden();
  return (
    <div className="h-40 w-full">
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
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={(v: number) => (hidden ? "" : formatAxisKr(v))}
            tickLine={false}
            axisLine={false}
            width={hidden ? 8 : 36}
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
                    In{" "}
                    <Amount value={point.income} currency={summary.currency} />
                  </p>
                  <p className="text-white/60">
                    Out{" "}
                    <Amount
                      value={point.spending}
                      currency={summary.currency}
                    />
                  </p>
                </div>
              );
            }}
          />
          {/* The month on show stands out; the others are there to compare. */}
          {(["income", "spending"] as const).map((key) => (
            <Bar
              key={key}
              dataKey={key}
              fill={key === "income" ? INCOME : SPENDING}
              radius={[4, 4, 0, 0]}
              maxBarSize={14}
              className="cursor-pointer"
              isAnimationActive={false}
            >
              {data.map((point, index) => (
                <Cell
                  key={`${point.year}-${point.month}`}
                  fillOpacity={index === picked ? 1 : 0.4}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MonthCard({
  summary,
  ongoing,
  onPickMonth,
}: {
  summary: CurrencySummary;
  ongoing: boolean;
  onPickMonth: (year: number, month: number) => void;
}) {
  const net = summary.net;
  const usual = summary.average_income - summary.average_spending;
  return (
    <Panel className="divide-y-0 p-5">
      <div className="grid grid-cols-3 gap-4">
        <Figure
          label="Money in"
          value={summary.income}
          currency={summary.currency}
          hint={
            ongoing
              ? "So far"
              : (versusUsual(summary.income, summary.average_income) ??
                "Salary, Swish and more")
          }
        />
        <Figure
          label="Money out"
          value={summary.spending}
          currency={summary.currency}
          hint={
            ongoing
              ? "So far"
              : (versusUsual(summary.spending, summary.average_spending) ??
                "Less refunds")
          }
        />
        <Figure
          label={net >= 0 ? "Saved" : "Overspent"}
          value={Math.abs(net)}
          currency={summary.currency}
          tone={net >= 0 ? "good" : "bad"}
          hint={
            <>
              Usually {usual >= 0 ? "saves" : "overspends"}{" "}
              <Amount value={Math.abs(usual)} currency={summary.currency} />
            </>
          }
        />
      </div>
      <div className="mt-5 mb-1 flex items-center justify-between gap-3">
        <p className="type-caption text-white/45">The last 12 months</p>
        <div className="flex items-center gap-3 type-caption text-white/50">
          <Legend color={INCOME}>In</Legend>
          <Legend color={SPENDING}>Out</Legend>
        </div>
      </div>
      <MonthBars summary={summary} onPickMonth={onPickMonth} />
    </Panel>
  );
}

function Legend({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-sm" style={{ background: color }} />
      {children}
    </span>
  );
}

function WhereItWent({
  summary,
  onPickCategory,
}: {
  summary: CurrencySummary;
  onPickCategory: (categoryId: string | null) => void;
}) {
  const { shown, rest } = topCategories(summary.categories);
  const largest = Math.max(1, shown[0]?.total ?? 0, rest);
  return (
    <Panel className="divide-y-0 p-5">
      <p className="mb-2 type-label text-white/55">Where it went</p>
      {shown.length === 0 ? (
        <p className="type-caption text-white/40">Nothing spent yet.</p>
      ) : (
        <ul className="-mx-2">
          {shown.map((category) => (
            <li key={category.category_id ?? "none"}>
              <button
                type="button"
                title={`${category.count} transaction${category.count === 1 ? "" : "s"}`}
                onClick={() => onPickCategory(category.category_id ?? null)}
                className="block w-full rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.05]"
              >
                <Share
                  label={category.name}
                  value={category.total}
                  currency={summary.currency}
                  fraction={category.total / largest}
                  color={
                    category.category_id
                      ? category.color
                      : "rgb(255 255 255 / 0.3)"
                  }
                />
              </button>
            </li>
          ))}
          {rest > 0 && (
            <li className="px-2 py-1.5">
              <Share
                label="Everything else"
                value={rest}
                currency={summary.currency}
                fraction={rest / largest}
                color="rgb(255 255 255 / 0.3)"
              />
            </li>
          )}
        </ul>
      )}
    </Panel>
  );
}

function Share({
  label,
  value,
  currency,
  fraction,
  color,
}: {
  label: string;
  value: number;
  currency: string;
  fraction: number;
  color: string;
}) {
  return (
    <>
      <span className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-13 text-white/75">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="truncate">{label}</span>
        </span>
        <Amount
          value={value}
          currency={currency}
          className="text-13 text-white/80"
        />
      </span>
      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/[0.05]">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(0, Math.min(1, fraction)) * 100}%`,
            backgroundColor: color,
          }}
        />
      </span>
    </>
  );
}

function Biggest({
  merchants,
  currency,
  onPickMerchant,
}: {
  merchants: SummaryMerchant[];
  currency: string;
  onPickMerchant: (description: string) => void;
}) {
  if (merchants.length === 0) return null;
  return (
    <Panel className="divide-y-0 p-5">
      <p className="mb-1 type-label text-white/55">Biggest spending</p>
      <ul className="-mx-2">
        {merchants.slice(0, TOP_MERCHANTS).map((merchant) => (
          <li key={merchant.description}>
            <button
              type="button"
              onClick={() => onPickMerchant(merchant.description)}
              className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors duration-150 hover:bg-white/[0.05]"
            >
              <span className="min-w-0 truncate text-13 text-white/75">
                {merchant.description}
                {merchant.count > 1 && (
                  <span className="ml-1.5 type-caption text-white/35">
                    {merchant.count} times
                  </span>
                )}
              </span>
              <Amount
                value={merchant.total}
                currency={currency}
                className="text-13 text-white/80"
              />
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ToSort({ count, onSort }: { count: number; onSort: () => void }) {
  return (
    <Panel className="flex items-center gap-3 divide-y-0 border-amber-300/15 bg-amber-300/[0.05] p-5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-300/15 text-amber-200">
        <Tag className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-13 font-medium text-white/85">
          {count} without a category
        </p>
        <p className="type-caption text-white/45">
          Sorted ones show up in where it went.
        </p>
      </div>
      <SoftButton onClick={onSort}>Sort them</SoftButton>
    </Panel>
  );
}

/** What a month's own money did: in, out, against usual, where it went. Transfers and company money stay out. */
export function MonthSummary({
  year,
  month,
  actions,
  children,
}: {
  year: number;
  month: number;
  actions: MonthSummaryActions;
  /** The month's list, under the figures and beside where the money went. */
  children: ReactNode;
}) {
  const { data, isLoading } = useQuery({
    ...getTransactionSummaryOptions({
      client,
      query: { year, month },
    }),
    placeholderData: keepPreviousData,
  });
  const [picked, setPicked] = useState<string | null>(null);

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-3">
        <div className="min-w-0 space-y-4 @4xl:col-span-2">
          <Skeleton className="h-72 rounded-xl bg-white/[0.06]" />
          {children}
        </div>
        <Skeleton className="h-72 rounded-xl bg-white/[0.06]" />
      </div>
    );
  }
  if (data.currencies.length === 0) return <>{children}</>;
  const now = new Date();
  // A month still running can't be held up against whole ones yet.
  const ongoing = year === now.getFullYear() && month === now.getMonth() + 1;
  const summary =
    data.currencies.find((c) => c.currency === picked) ?? data.currencies[0];

  return (
    <div className="space-y-3">
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
      <div className="grid grid-cols-1 items-start gap-4 @4xl:grid-cols-3">
        <div className="min-w-0 space-y-3 @4xl:col-span-2">
          <MonthCard
            summary={summary}
            ongoing={ongoing}
            onPickMonth={actions.onPickMonth}
          />
          {data.transfers > 0 && (
            <button
              type="button"
              onClick={actions.onShowTransfers}
              className="px-1 type-caption text-white/40 underline-offset-2 transition-colors hover:text-white/75 hover:underline"
            >
              {data.transfers} moves between your own accounts left out
            </button>
          )}
          {children}
        </div>
        <div className="min-w-0 space-y-4 @4xl:sticky @4xl:top-4">
          {data.uncategorized > 0 && (
            <ToSort
              count={data.uncategorized}
              onSort={() => actions.onPickCategory(null)}
            />
          )}
          <WhereItWent
            summary={summary}
            onPickCategory={actions.onPickCategory}
          />
          <Biggest
            merchants={summary.merchants}
            currency={summary.currency}
            onPickMerchant={actions.onPickMerchant}
          />
        </div>
      </div>
    </div>
  );
}
