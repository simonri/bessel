import type { TradeSchema } from "@bessel/client";
import { listTradesV1InvestmentsTradesGetOptions } from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "@/components/data-table";
import { EmptyState, PeriodNav, placeholderKeys } from "@/components/ui-kit";
import { client } from "@/lib/client";
import type { DataColumnDef } from "@/lib/data-table";
import { formatAmount, formatQuantity } from "@/lib/money";
import { cn } from "@/lib/utils";

export function TradesTab() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading } = useQuery({
    ...listTradesV1InvestmentsTradesGetOptions({
      client,
      query: { page, limit },
    }),
    placeholderData: keepPreviousData,
  });

  // Stable identity so react-table doesn't rebuild its column model per render.
  const columns: DataColumnDef<TradeSchema>[] = useMemo(
    () => [
      {
        accessorKey: "trade_date",
        header: "Date",
        size: 110,
        cell: ({ row }) => (
          <span className="text-12 tabular-nums text-white/55">
            {format(row.original.trade_date, "yyyy-MM-dd")}
          </span>
        ),
      },
      {
        accessorKey: "trade_type",
        header: "Type",
        size: 70,
        cell: ({ row }) => (
          <span
            className={cn(
              "inline-flex h-5 items-center rounded-md px-1.5 text-11 font-medium capitalize",
              row.original.trade_type === "buy"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-red-500/10 text-red-400",
            )}
          >
            {row.original.trade_type}
          </span>
        ),
      },
      {
        accessorKey: "security_name",
        header: "Security",
        cell: ({ row }) => (
          <span className="block truncate font-medium text-white/85">
            {row.original.security_name}
          </span>
        ),
      },
      {
        accessorKey: "bank_account_name",
        header: "Account",
        size: 130,
        cell: ({ row }) => (
          <span className="block truncate text-12 text-white/55">
            {row.original.bank_account_name}
          </span>
        ),
      },
      {
        accessorKey: "quantity",
        header: () => <div className="text-right">Quantity</div>,
        size: 120,
        cell: ({ row }) => (
          <div className="text-right tabular-nums text-white/70">
            {formatQuantity(row.original.quantity)}
          </div>
        ),
      },
      {
        accessorKey: "price_per_unit",
        header: () => <div className="text-right">Price/Unit</div>,
        size: 120,
        cell: ({ row }) => (
          <div className="text-right tabular-nums text-white/70">
            {formatAmount(row.original.price_per_unit)}
          </div>
        ),
      },
      {
        id: "total",
        header: () => <div className="text-right">Total</div>,
        size: 120,
        cell: ({ row }) => {
          const total =
            (row.original.quantity * row.original.price_per_unit) / 1_000_000;
          return (
            <div className="text-right font-medium tabular-nums text-white/85">
              {formatAmount(total)}
            </div>
          );
        },
      },
      {
        accessorKey: "currency",
        header: "Ccy",
        size: 60,
        cell: ({ row }) => (
          <span className="text-12 text-white/45">{row.original.currency}</span>
        ),
      },
      {
        accessorKey: "notes",
        header: "Notes",
        cell: ({ row }) => (
          <span className="block truncate text-12 text-white/45">
            {row.original.notes ?? ""}
          </span>
        ),
      },
    ],
    [],
  );

  const trades = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="space-y-2">
          {placeholderKeys(6).map((key) => (
            <Skeleton
              key={key}
              className="h-10 w-full rounded-lg bg-white/[0.06]"
            />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <EmptyState icon={<TrendingUp />} title="No trades yet">
          Trades appear here once an Avanza account is linked and synced.
        </EmptyState>
      ) : (
        <DataTable columns={columns} data={trades} />
      )}

      {maxPage > 1 && (
        <div className="flex justify-end">
          <PeriodNav
            label={`${page} / ${maxPage}`}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => Math.min(maxPage, p + 1))}
            prevDisabled={page <= 1}
            nextDisabled={page >= maxPage}
          />
        </div>
      )}
    </div>
  );
}
