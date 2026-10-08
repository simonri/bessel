import type { HoldingSchema } from "@bessel/client";
import { getHoldingsV1InvestmentsHoldingsGetOptions } from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { CreateSecurityDialog } from "@/components/create-security-dialog";
import { CreateTradeDialog } from "@/components/create-trade-dialog";
import { DataTable } from "@/components/data-table";
import {
  BarRow,
  EmptyState,
  Panel,
  SectionLabel,
  StatTile,
} from "@/components/ui-kit";
import { client } from "@/lib/client";
import { formatAmount, formatQuantity } from "@/lib/money";
import { cn } from "@/lib/utils";

const NUMERIC_CELL = "text-right tabular-nums text-white/70";

function signed(value: number) {
  return `${value >= 0 ? "+" : ""}${formatAmount(value)}`;
}

function gainClass(value: number) {
  return value >= 0 ? "text-income" : "text-expense";
}

// Module scope: captures nothing, so there's no reason to rebuild the column
// model (and every cell closure) per render.
const columns: ColumnDef<HoldingSchema>[] = [
  {
    accessorKey: "security_name",
    header: "Security",
    cell: ({ row }) => (
      <div className="min-w-0">
        <div className="truncate font-medium text-white/85">
          {row.original.security_name}
        </div>
        {row.original.ticker && (
          <div className="truncate text-11 tracking-wide text-white/40">
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
      <span className="text-white/55 capitalize">
        {row.original.asset_type.replace("_", " ")}
      </span>
    ),
  },
  {
    accessorKey: "quantity",
    header: () => <div className="text-right">Quantity</div>,
    size: 120,
    cell: ({ row }) => (
      <div className={NUMERIC_CELL}>
        {formatQuantity(row.original.quantity)}
      </div>
    ),
  },
  {
    accessorKey: "avg_cost_per_unit",
    header: () => <div className="text-right">Avg Cost</div>,
    size: 120,
    cell: ({ row }) => (
      <div className={NUMERIC_CELL}>
        {formatAmount(row.original.avg_cost_per_unit)}
      </div>
    ),
  },
  {
    accessorKey: "current_price",
    header: () => <div className="text-right">Price</div>,
    size: 120,
    cell: ({ row }) => (
      <div className={NUMERIC_CELL}>
        {row.original.current_price != null ? (
          formatAmount(row.original.current_price)
        ) : (
          <span className="text-white/30">—</span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "current_value",
    header: () => <div className="text-right">Value</div>,
    size: 140,
    cell: ({ row }) => (
      <div className="text-right font-medium tabular-nums text-white/85">
        {row.original.current_value != null ? (
          <>
            {formatAmount(row.original.current_value)}
            <span className="ml-1 text-11 font-normal text-white/40">
              {row.original.currency}
            </span>
          </>
        ) : (
          <span className="font-normal text-white/30">—</span>
        )}
      </div>
    ),
  },
  {
    accessorKey: "gain_loss",
    header: () => <div className="text-right">Gain/Loss</div>,
    size: 170,
    cell: ({ row }) => {
      const { gain_loss, gain_loss_pct, currency } = row.original;
      if (gain_loss == null)
        return <div className="text-right text-white/30">—</div>;
      return (
        <div className={cn("text-right tabular-nums", gainClass(gain_loss))}>
          {signed(gain_loss)}
          <span className="ml-1 text-11 text-white/40">{currency}</span>
          {gain_loss_pct != null && (
            <span className="ml-1.5 text-11 opacity-80">
              {gain_loss_pct >= 0 ? "+" : ""}
              {gain_loss_pct.toFixed(1)}%
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

  // Portfolio totals only make sense when every holding shares a currency.
  const summary = useMemo(() => {
    const currencies = new Set(holdings.map((h) => h.currency));
    if (currencies.size !== 1) return null;
    let value = 0;
    let costBasis = 0;
    let pricedCost = 0;
    let gain = 0;
    for (const h of holdings) {
      costBasis += h.cost_basis;
      if (h.current_value != null) {
        value += h.current_value;
        pricedCost += h.cost_basis;
        gain += h.gain_loss ?? 0;
      }
    }
    return {
      currency: [...currencies][0],
      value,
      costBasis,
      gain,
      gainPct: pricedCost > 0 ? (gain / pricedCost) * 100 : null,
    };
  }, [holdings]);

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-[4.25rem] rounded-xl bg-white/[0.06]"
            />
          ))}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-10 w-full rounded-lg bg-white/[0.06]"
            />
          ))}
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp />}
        title="No holdings yet"
        className="py-12"
      >
        <p>Add securities and record trades to get started.</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <CreateSecurityDialog />
          <CreateTradeDialog />
        </div>
      </EmptyState>
    );
  }

  const totalValue = allocationData.reduce((s, d) => s + d.value, 0);
  const maxValue = allocationData[0]?.value ?? 0;

  return (
    <div className="space-y-5">
      {summary && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
          <StatTile
            label="Portfolio value"
            value={formatAmount(summary.value)}
            hint={summary.currency}
          />
          <StatTile
            label="Cost basis"
            value={formatAmount(summary.costBasis)}
            hint={`${holdings.length} holding${holdings.length !== 1 ? "s" : ""}`}
          />
          <StatTile
            label="Gain/Loss"
            value={
              <span className={gainClass(summary.gain)}>
                {signed(summary.gain)}
              </span>
            }
            hint={
              summary.gainPct != null
                ? `${summary.gainPct >= 0 ? "+" : ""}${summary.gainPct.toFixed(1)}%`
                : summary.currency
            }
          />
        </div>
      )}

      {allocationData.length > 0 && (
        <section>
          <SectionLabel>Allocation</SectionLabel>
          <Panel className="space-y-2.5 divide-y-0 px-4 py-3.5">
            {allocationData.map((item) => (
              <BarRow
                key={item.name}
                label={<span className="capitalize">{item.name}</span>}
                fraction={maxValue > 0 ? item.value / maxValue : 0}
                value={formatAmount(item.value)}
                detail={`${totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0}%`}
              />
            ))}
          </Panel>
        </section>
      )}

      <section>
        <SectionLabel>Positions</SectionLabel>
        <DataTable columns={columns} data={holdings} />
      </section>
    </div>
  );
}
