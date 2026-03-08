import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { monthlyFlowV1TransactionsMonthlyFlowGetOptions } from "@metron/client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@metron/ui/components/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@metron/ui/components/chart";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/")({
  component: Dashboard,
});

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
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

function Dashboard() {
  const { data } = useQuery(
    monthlyFlowV1TransactionsMonthlyFlowGetOptions({
      client,
      query: { months: 6 },
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
      <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Income & Expenses
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="text-muted-foreground flex h-48 items-center justify-center text-sm">
              No data yet
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="aspect-auto h-[280px] w-full">
              <BarChart
                data={chartData}
                margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12 }}
                />
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
                <Bar
                  dataKey="income"
                  fill="var(--color-income)"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="expenses"
                  fill="var(--color-expenses)"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
