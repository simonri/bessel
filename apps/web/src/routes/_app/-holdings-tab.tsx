import type { HoldingSchema } from "@metron/client";
import { getHoldingsV1InvestmentsHoldingsGetOptions } from "@metron/client";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@metron/ui/components/empty";
import { Skeleton } from "@metron/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { CreateSecurityDialog } from "@/components/create-security-dialog";
import { CreateTradeDialog } from "@/components/create-trade-dialog";
import { DataTable } from "@/components/data-table";
import { client } from "@/lib/client";
import { formatAmount, formatQuantity } from "@/lib/money";

// Module scope: captures nothing, so there's no reason to rebuild the column
// model (and every cell closure) per render.
const columns: ColumnDef<HoldingSchema>[] = [
  {
    accessorKey: "security_name",
    header: "Security",
    cell: ({ row }) => (
      <div>
        <div className="font-medium">{row.original.security_name}</div>
        {row.original.ticker && (
          <div className="text-muted-foreground text-xs">
            {row.original.ticker}
          </div>
        )}
      </div>
    ),
  },
  {
    accessorKey: "asset_type",
    header: "Type",
    size: 100,
    cell: ({ row }) => (
      <span className="capitalize">
        {row.original.asset_type.replace("_", " ")}
      </span>
    ),
  },
  {
    accessorKey: "quantity",
    header: () => <div className="text-right">Quantity</div>,
    size: 120,
    cell: ({ row }) => (
      <div className="text-right font-mono tabular-nums">
        {formatQuantity(row.original.quantity)}
      </div>
    ),
  },
  {
    accessorKey: "avg_cost_per_unit",
    header: () => <div className="text-right">Avg Cost</div>,
    size: 120,
    cell: ({ row }) => (
      <div className="text-right font-mono tabular-nums">
        {formatAmount(row.original.avg_cost_per_unit)}
      </div>
    ),
  },
  {
    accessorKey: "current_price",
    header: () => <div className="text-right">Price</div>,
    size: 120,
    cell: ({ row }) => (
      <div className="text-right font-mono tabular-nums">
        {row.original.current_price != null
          ? formatAmount(row.original.current_price)
          : "—"}
      </div>
    ),
  },
  {
    accessorKey: "current_value",
    header: () => <div className="text-right">Value</div>,
    size: 140,
    cell: ({ row }) => (
      <div className="text-right font-mono tabular-nums">
        {row.original.current_value != null
          ? `${formatAmount(row.original.current_value)} ${row.original.currency}`
          : "—"}
      </div>
    ),
  },
  {
    accessorKey: "gain_loss",
    header: () => <div className="text-right">Gain/Loss</div>,
    size: 170,
    cell: ({ row }) => {
      const { gain_loss, gain_loss_pct, currency } = row.original;
      if (gain_loss == null) return <div className="text-right">—</div>;
      const isPositive = gain_loss >= 0;
      return (
        <div
          className={`text-right font-mono tabular-nums ${isPositive ? "text-income" : "text-expense"}`}
        >
          {isPositive ? "+" : ""}
          {formatAmount(gain_loss)} {currency}
          {gain_loss_pct != null && (
            <span className="text-muted-foreground text-xs ml-1">
              ({isPositive ? "+" : ""}
              {gain_loss_pct.toFixed(1)}%)
            </span>
          )}
        </div>
      );
    },
  },
];

export function HoldingsTab() {
  const { data, isLoading } = useQuery({
    ...getHoldingsV1InvestmentsHoldingsGetOptions({ client }),
  });

  const holdings = data?.items ?? [];

  // Aggregate by asset_type for the donut chart
  const allocationData = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of holdings) {
      if (h.current_value != null) {
        const label = h.asset_type.replace(/_/g, " ");
        map.set(label, (map.get(label) ?? 0) + h.current_value);
      }
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [holdings]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-x-8 gap-y-3 pb-4 border-b">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <Empty className="border">
        <EmptyMedia>
          <TrendingUp />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No holdings yet</EmptyTitle>
          <EmptyDescription>
            Add securities and record trades to get started.
          </EmptyDescription>
        </EmptyHeader>
        <div className="flex gap-2">
          <CreateSecurityDialog />
          <CreateTradeDialog />
        </div>
      </Empty>
    );
  }

  const totalValue = allocationData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Allocation strip */}
      {allocationData.length > 0 && (
        <div className="flex flex-wrap gap-x-8 gap-y-3 pb-4 border-b">
          {allocationData.map((item) => {
            const pct =
              totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0;
            return (
              <div key={item.name}>
                <p className="text-muted-foreground text-xs capitalize">
                  {item.name}
                </p>
                <p className="mt-0.5 text-base font-medium tabular-nums">
                  {formatAmount(item.value)}
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {pct}%
                  </span>
                </p>
              </div>
            );
          })}
        </div>
      )}

      <DataTable columns={columns} data={holdings} />
    </div>
  );
}
