import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  monthlyFlowV1TransactionsMonthlyFlowGetOptions,
  listBankAccountsV1BankAccountsGetOptions,
  listTransactionsV1TransactionsGetOptions,
  listCategoriesV1CategoriesGetOptions,
} from "@metron/client";
import { Card, CardContent } from "@metron/ui/components/card";
import { client } from "@/lib/client";
import { formatMoney, formatAmount } from "@/lib/money";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function Dashboard() {
  const { data: flowData } = useQuery(
    monthlyFlowV1TransactionsMonthlyFlowGetOptions({ client, query: { months: 2 } }),
  );
  const { data: accountsData } = useQuery(
    listBankAccountsV1BankAccountsGetOptions({ client, query: { limit: 50, sorting: ["name"] } }),
  );
  const { data: transactionsData } = useQuery(
    listTransactionsV1TransactionsGetOptions({
      client,
      query: { limit: 5, sorting: ["-transaction_date"] },
    }),
  );
  const { data: categoriesData } = useQuery(
    listCategoriesV1CategoriesGetOptions({ client, query: { limit: 200 } }),
  );

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    for (const cat of categoriesData?.items ?? []) map.set(cat.id, { name: cat.name, color: cat.color });
    return map;
  }, [categoriesData]);

  const accounts = accountsData?.items ?? [];

  const netWorthByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const acc of accounts) {
      const bal = acc.current_balance ?? acc.base_balance;
      map.set(acc.currency, (map.get(acc.currency) ?? 0) + bal);
    }
    return map;
  }, [accounts]);

  // Month-over-month delta from last 2 months
  const monthDelta = useMemo(() => {
    const items = flowData?.items ?? [];
    if (items.length < 2) return null;
    const [prev, curr] = items.slice(-2);
    const prevNet = prev.income - prev.expenses;
    const currNet = curr.income - curr.expenses;
    if (prevNet === 0) return null;
    return Math.round(((currNet - prevNet) / Math.abs(prevNet)) * 100);
  }, [flowData]);

  const currentFlow = flowData?.items.at(-1);

  return (
    <div className="space-y-10">

      {/* Net worth + accounts */}
      {accounts.length > 0 && (
        <section className="space-y-4 animate-in fade-in duration-150">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Net worth
            </p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              {[...netWorthByCurrency.entries()].map(([currency, total]) => (
                <p key={currency} className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatMoney(total, currency)}
                </p>
              ))}
            </div>
            {monthDelta !== null && (
              <p className={`mt-1 text-sm ${monthDelta >= 0 ? "text-income" : "text-expense"}`}>
                {monthDelta >= 0 ? "+" : ""}{monthDelta}% vs last month
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {accounts.map((account) => (
              <Card key={account.id} className="gap-1 py-4 shadow-none">
                <CardContent className="px-4">
                  <p className="text-muted-foreground truncate text-xs">{account.name}</p>
                  <p className="mt-0.5 text-base font-medium tabular-nums">
                    {formatMoney(account.current_balance ?? account.base_balance, account.currency)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* This month */}
      {currentFlow && (
        <section className="space-y-3 animate-in fade-in duration-150">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {MONTH_SHORT[currentFlow.month - 1]} {currentFlow.year}
          </p>
          <div className="flex items-baseline gap-8">
            <div>
              <p className="text-muted-foreground text-xs">Income</p>
              <p className="text-xl font-medium tabular-nums text-income">
                {formatAmount(currentFlow.income)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Expenses</p>
              <p className="text-xl font-medium tabular-nums text-expense">
                {formatAmount(currentFlow.expenses)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Net</p>
              <p className={`text-xl font-medium tabular-nums ${currentFlow.income >= currentFlow.expenses ? "text-income" : "text-expense"}`}>
                {formatAmount(currentFlow.income - currentFlow.expenses)}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Recent transactions */}
      {transactionsData?.items && transactionsData.items.length > 0 && (
        <section className="space-y-3 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Recent transactions
            </p>
            <Link to="/transactions" className="text-muted-foreground hover:text-foreground text-xs transition-colors">
              View all
            </Link>
          </div>
          <div className="divide-y">
            {transactionsData.items.map((tx) => {
              const cat = tx.category_id ? categoryMap.get(tx.category_id) : null;
              return (
                <div key={tx.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1 flex items-center gap-2.5">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: cat?.color ?? "var(--border)" }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm">{tx.description ?? "—"}</p>
                      <p className="text-muted-foreground text-xs">{cat?.name ?? "Uncategorized"}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 text-sm tabular-nums ${
                      tx.direction === "credit"
                        ? "text-income"
                        : "text-expense"
                    }`}
                  >
                    {tx.direction === "credit" ? "+" : "−"}
                    {formatAmount(tx.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
