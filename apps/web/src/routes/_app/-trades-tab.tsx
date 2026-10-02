import type { TradeSchema } from "@bessel/client";
import {
  deleteTradeV1InvestmentsTradesTradeIdDeleteMutation,
  getHoldingsV1InvestmentsHoldingsGetOptions,
  listTradesV1InvestmentsTradesGetOptions,
  listTradesV1InvestmentsTradesGetQueryKey,
} from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Trash2, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { CreateTradeDialog } from "@/components/create-trade-dialog";
import { DataTable } from "@/components/data-table";
import {
  EmptyState,
  IconButton,
  PageToolbar,
  PeriodNav,
} from "@/components/ui-kit";
import { client } from "@/lib/client";
import { formatAmount, formatQuantity } from "@/lib/money";
import { cn } from "@/lib/utils";

export function TradesTab() {
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<TradeSchema | null>(null);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    ...listTradesV1InvestmentsTradesGetOptions({
      client,
      query: { page, limit },
    }),
    placeholderData: keepPreviousData,
  });

  const queryKey = listTradesV1InvestmentsTradesGetQueryKey({ client });

  const deleteMutation = useMutation({
    ...deleteTradeV1InvestmentsTradesTradeIdDeleteMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({
        queryKey: getHoldingsV1InvestmentsHoldingsGetOptions({ client })
          .queryKey,
      });
      toast.success("Trade deleted");
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error("Failed to delete trade");
    },
  });

  // Stable identity so react-table doesn't rebuild its column model per render.
  const columns: ColumnDef<TradeSchema>[] = useMemo(
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
      {
        id: "actions",
        size: 50,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <IconButton
              destructive
              title="Delete trade"
              onClick={() => setDeleteTarget(row.original)}
            >
              <Trash2 />
            </IconButton>
          </div>
        ),
      },
    ],
    [],
  );

  const trades = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;

  return (
    <div className="space-y-4">
      <PageToolbar>
        <CreateTradeDialog />
      </PageToolbar>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-10 w-full rounded-lg bg-white/[0.06]"
            />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <EmptyState icon={<TrendingUp />} title="No trades yet">
          Record your first trade to see it here.
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

      <ConfirmDeleteDialog
        size="sm"
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete trade?"
        description={
          <>
            This trade will be permanently removed. This can&rsquo;t be undone.
          </>
        }
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate({
            client,
            path: { trade_id: deleteTarget.id },
          });
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
