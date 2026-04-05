import { useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  monthlyFlowV1TransactionsMonthlyFlowGetOptions,
  listBankAccountsV1BankAccountsGetOptions,
  listTransactionsV1TransactionsGetOptions,
} from "@metron/client";
import { Card, CardContent, CardHeader, CardTitle } from "@metron/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@metron/ui/components/chart";
import { Button } from "@metron/ui/components/button";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const chartConfig = {
  income: {
    label: "Income",
    color: "oklch(0.72 0.17 142)",
  },
  expenses: {
    label: "Expenses",
    color: "oklch(0.64 0.2 25)",
  },
} satisfies ChartConfig;

function formatBalance(amount: number, currency: string) {
  return (amount / 100).toLocaleString("sv-SE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  });
}

function formatAmount(amount: number) {
  return (amount / 100).toLocaleString("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function Dashboard() {
  const { data } = useQuery(
    monthlyFlowV1TransactionsMonthlyFlowGetOptions({
      client,
      query: { months: 6 },
    }),
  );

  const { data: accountsData } = useQuery(
    listBankAccountsV1BankAccountsGetOptions({
      client,
      query: { limit: 50, sorting: ["name"] },
    }),
  );

  const { data: transactionsData } = useQuery(
    listTransactionsV1TransactionsGetOptions({
      client,
      query: { limit: 5, sorting: ["-transaction_date"] },
    }),
  );

  const chartData = useMemo(
    () =>
      data?.items.map((item) => ({
        month: `${MONTH_SHORT[item.month - 1]} ${item.year}`,
        income: item.income / 100,
        expenses: item.expenses / 100,
      })) ?? [],
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/transactions">Import Transactions</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/accounts">Add Account</Link>
          </Button>
        </div>
      </div>

      {/* Account Balances */}
      {accountsData?.items && accountsData.items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {accountsData.items.map((account) => (
            <Card key={account.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {account.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">
                  {formatBalance(account.current_balance ?? account.base_balance, account.currency)}
                </div>
                <p className="text-xs text-muted-foreground capitalize">{account.subtype}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Income & Expenses Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Income & Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
              No data yet
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
              <BarChart data={chartData} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={60}
                  tickFormatter={(v: number) => v.toLocaleString("sv-SE")}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) =>
                        (value as number).toLocaleString("sv-SE", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      }
                    />
                  }
                />
                <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {!transactionsData?.items || transactionsData.items.length === 0 ? (
            <div className="text-muted-foreground flex h-24 items-center justify-center text-sm">
              No transactions yet
            </div>
          ) : (
            <div className="space-y-3">
              {transactionsData.items.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {tx.description ?? "No description"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.transaction_date).toLocaleDateString("sv-SE")}
                    </p>
                  </div>
                  <span
                    className={`ml-4 text-sm font-medium whitespace-nowrap ${
                      tx.direction === "credit"
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {tx.direction === "credit" ? "+" : "-"}
                    {formatAmount(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
