import type { TradeSchema } from "@bessel/client";
import {
  deleteTradeV1InvestmentsTradesTradeIdDeleteMutation,
  getHoldingsV1InvestmentsHoldingsGetOptions,
  listTradesV1InvestmentsTradesGetOptions,
  listTradesV1InvestmentsTradesGetQueryKey,
} from "@bessel/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@bessel/ui/components/alert-dialog";
import { Button } from "@bessel/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@bessel/ui/components/empty";
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
import { CreateTradeDialog } from "@/components/create-trade-dialog";
import { DataTable } from "@/components/data-table";
import { client } from "@/lib/client";
import { formatAmount, formatQuantity } from "@/lib/money";

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
        cell: ({ row }) => format(row.original.trade_date, "yyyy-MM-dd"),
      },
      {
        accessorKey: "trade_type",
        header: "Type",
        size: 70,
        cell: ({ row }) => (
          <span
            className={`font-medium capitalize ${row.original.trade_type === "buy" ? "text-income" : "text-expense"}`}
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
          <div className="text-right font-mono tabular-nums">
            {formatQuantity(row.original.quantity)}
          </div>
        ),
      },
      {
        accessorKey: "price_per_unit",
        header: () => <div className="text-right">Price/Unit</div>,
        size: 120,
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
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
            <div className="text-right font-mono tabular-nums">
              {formatAmount(total)}
            </div>
          );
        },
      },
      {
        accessorKey: "currency",
        header: "Ccy",
        size: 60,
      },
      {
        accessorKey: "notes",
        header: "Notes",
        cell: ({ row }) => (
          <span className="block truncate text-muted-foreground">
            {row.original.notes ?? ""}
          </span>
        ),
      },
      {
        id: "actions",
        size: 50,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            title="Delete"
            className="hover:text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        ),
      },
    ],
    [],
  );

  const trades = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateTradeDialog />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : trades.length === 0 ? (
        <Empty className="border">
          <EmptyMedia>
            <TrendingUp />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No trades yet</EmptyTitle>
            <EmptyDescription>
              Record your first trade to see it here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable columns={columns} data={trades} />
      )}

      {maxPage > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {page} of {maxPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
            disabled={page >= maxPage}
          >
            Next
          </Button>
        </div>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This trade will be permanently removed. This can&rsquo;t be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate({
                  client,
                  path: { trade_id: deleteTarget.id },
                });
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
