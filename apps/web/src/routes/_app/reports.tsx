import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  spendingByCategoryV1TransactionsSpendingByCategoryGetOptions,
  monthlyFlowV1TransactionsMonthlyFlowGetOptions,
  listTransactionsV1TransactionsGetOptions,
} from "@metron/client";
import { client } from "@/lib/client";
import { formatAmount } from "@/lib/money";

export const Route = createFileRoute("/_app/reports")({
  component: Reports,
});

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function currentYearMonth() {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

function Reports() {
  const { year, month } = currentYearMonth();
  const [selectedMonth, setSelectedMonth] = useState(month);
  const [selectedYear, setSelectedYear] = useState(year);

  const { data: spendingData } = useQuery(
    spendingByCategoryV1TransactionsSpendingByCategoryGetOptions({
      client,
      query: { year: selectedYear, month: selectedMonth },
    }),
  );

  const { data: flowData } = useQuery(
    monthlyFlowV1TransactionsMonthlyFlowGetOptions({ client, query: { months: 12 } }),
  );

  const { data: txBizData } = useQuery(
    listTransactionsV1TransactionsGetOptions({ client, query: { limit: 1, is_business: true } }),
  );
  const { data: txTotalData } = useQuery(
    listTransactionsV1TransactionsGetOptions({ client, query: { limit: 1 } }),
  );

  const businessCount = txBizData?.pagination.total_count ?? 0;
  const totalCount = txTotalData?.pagination.total_count ?? 0;
  const businessPct = totalCount > 0 ? Math.round((businessCount / totalCount) * 100) : 0;

  const spendingItems = spendingData?.items ?? [];
  const totalSpending = spendingItems.reduce((sum, i) => sum + i.total, 0);

  // Month-over-month flow comparison
  const flowComparison = useMemo(() => {
    const items = flowData?.items ?? [];
    if (items.length < 2) return null;
    const prev = items.at(-2)!;
    const curr = items.at(-1)!;
    const expenseDelta = curr.expenses - prev.expenses;
    const expensePct = prev.expenses > 0 ? Math.round((expenseDelta / prev.expenses) * 100) : 0;
    return { curr, prev, expenseDelta, expensePct };
  }, [flowData]);

  const monthOptions = useMemo(() => {
    const opts: { label: string; year: number; month: number }[] = [];
    let d = new Date(year, month - 1, 1);
    for (let i = 0; i < 12; i++) {
      opts.push({ label: `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`, year: d.getFullYear(), month: d.getMonth() + 1 });
      d = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    }
    return opts;
  }, [year, month]);

  return (
    <div className="space-y-12">
      <h2 className="text-2xl font-semibold tracking-tight">Reports</h2>

      {/* Key numbers */}
      {totalCount > 0 && (
        <section className="animate-in fade-in duration-150">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
            Overview
          </p>
          <div className="flex flex-wrap gap-x-10 gap-y-6">
            <div>
              <p className="text-muted-foreground text-xs">Transactions</p>
              <p className="mt-0.5 text-2xl font-semibold tabular-nums">
                {totalCount.toLocaleString("sv-SE")}
              </p>
            </div>
            {businessCount > 0 && (
              <div>
                <p className="text-muted-foreground text-xs">Business</p>
                <p className="mt-0.5 text-2xl font-semibold tabular-nums">{businessPct}%</p>
              </div>
            )}
            {flowComparison && (
              <div>
                <p className="text-muted-foreground text-xs">
                  Expenses vs {MONTH_SHORT[flowComparison.prev.month - 1]}
                </p>
                <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${flowComparison.expensePct > 0 ? "text-expense" : "text-income"}`}>
                  {flowComparison.expensePct > 0 ? "+" : ""}{flowComparison.expensePct}%
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Monthly income / expense numbers — 12 months */}
      {(flowData?.items.length ?? 0) > 0 && (
        <section className="animate-in fade-in duration-150">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
            Last 12 months
          </p>
          <div className="divide-y">
            {[...(flowData?.items ?? [])].reverse().map((item) => {
              const net = item.income - item.expenses;
              return (
                <div key={`${item.year}-${item.month}`} className="grid grid-cols-4 gap-4 py-3 text-sm first:pt-0">
                  <span className="text-muted-foreground">
                    {MONTH_SHORT[item.month - 1]} {item.year}
                  </span>
                  <span className="tabular-nums text-income">
                    +{formatAmount(item.income)}
                  </span>
                  <span className="tabular-nums text-expense">
                    −{formatAmount(item.expenses)}
                  </span>
                  <span className={`tabular-nums font-medium ${net >= 0 ? "text-income" : "text-expense"}`}>
                    {net >= 0 ? "+" : "−"}{formatAmount(Math.abs(net))}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Spending by category */}
      <section className="animate-in fade-in duration-150">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Spending by category
          </p>
          <select
            className="border-input bg-background text-foreground rounded-md border px-2 py-1 text-xs"
            value={`${selectedYear}-${selectedMonth}`}
            onChange={(e) => {
              const [y, m] = e.target.value.split("-").map(Number);
              setSelectedYear(y);
              setSelectedMonth(m);
            }}
          >
            {monthOptions.map((opt) => (
              <option key={opt.label} value={`${opt.year}-${opt.month}`}>{opt.label}</option>
            ))}
          </select>
        </div>

        {spendingItems.length === 0 ? (
          <p className="text-muted-foreground text-sm">No spending data for this month.</p>
        ) : (
          <div className="space-y-3">
            {spendingItems.map((item) => {
              const pct = totalSpending > 0 ? (item.total / totalSpending) * 100 : 0;
              return (
                <div key={item.category_id}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: item.category_color }}
                      />
                      <span className="text-sm truncate">{item.category_name}</span>
                    </div>
                    <div className="flex items-baseline gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {Math.round(pct)}%
                      </span>
                      <span className="font-mono tabular-nums text-sm">
                        {formatAmount(item.total)}
                      </span>
                    </div>
                  </div>
                  {/* Proportional bar — 1px, category colour */}
                  <div className="h-px w-full bg-border/40">
                    <div
                      className="h-full transition-all duration-300"
                      style={{ width: `${pct}%`, backgroundColor: item.category_color }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="border-t pt-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono tabular-nums">{formatAmount(totalSpending)}</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
