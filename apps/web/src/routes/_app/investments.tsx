import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Trash2, Search, TrendingUp } from "lucide-react";
import { Input } from "@metron/ui/components/input";
import type { SecuritySchema, TradeSchema, HoldingSchema } from "@metron/client";
import {
  listSecuritiesV1InvestmentsSecuritiesGetOptions,
  listSecuritiesV1InvestmentsSecuritiesGetQueryKey,
  deleteSecurityV1InvestmentsSecuritiesSecurityIdDeleteMutation,
  listTradesV1InvestmentsTradesGetOptions,
  listTradesV1InvestmentsTradesGetQueryKey,
  deleteTradeV1InvestmentsTradesTradeIdDeleteMutation,
  getHoldingsV1InvestmentsHoldingsGetOptions,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@metron/ui/components/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@metron/ui/components/alert-dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@metron/ui/components/empty";
import { DataTable } from "@/components/data-table";
import { CreateSecurityDialog } from "@/components/create-security-dialog";
import { EditSecurityDialog } from "@/components/edit-security-dialog";
import { CreateTradeDialog } from "@/components/create-trade-dialog";
import { UpdatePriceDialog } from "@/components/update-price-dialog";
import { toast } from "sonner";
import { client } from "@/lib/client";
import { formatAmount, formatQuantity } from "@/lib/money";

export const Route = createFileRoute("/_app/investments")({
  component: Investments,
});


function Investments() {
  return (
    <div className="flex flex-col space-y-4">
      <h2 className="text-2xl font-bold tracking-tight">Investments</h2>
      <Tabs defaultValue="holdings" className="flex flex-col">
        <TabsList className="w-fit">
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
          <TabsTrigger value="securities">Securities</TabsTrigger>
        </TabsList>
        <TabsContent value="holdings" className="min-h-0 flex-1">
          <HoldingsTab />
        </TabsContent>
        <TabsContent value="trades" className="min-h-0 flex-1">
          <TradesTab />
        </TabsContent>
        <TabsContent value="securities" className="min-h-0 flex-1">
          <SecuritiesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Holdings Tab ───

function HoldingsTab() {
  const { data, isLoading } = useQuery({
    ...getHoldingsV1InvestmentsHoldingsGetOptions({ client }),
  });

  const columns: ColumnDef<HoldingSchema>[] = [
    {
      accessorKey: "security_name",
      header: "Security",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.security_name}</div>
          {row.original.ticker && (
            <div className="text-muted-foreground text-xs">{row.original.ticker}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: "asset_type",
      header: "Type",
      size: 100,
      cell: ({ row }) => (
        <span className="capitalize">{row.original.asset_type.replace("_", " ")}</span>
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
          {row.original.current_price != null ? formatAmount(row.original.current_price) : "—"}
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

  if (isLoading) return null;

  if (holdings.length === 0) {
    return (
      <Empty className="border">
        <EmptyMedia >
          <TrendingUp />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>No holdings yet</EmptyTitle>
          <EmptyDescription>Add securities and record trades to get started.</EmptyDescription>
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
            const pct = totalValue > 0 ? Math.round((item.value / totalValue) * 100) : 0;
            return (
              <div key={item.name}>
                <p className="text-muted-foreground text-xs capitalize">{item.name}</p>
                <p className="mt-0.5 text-base font-medium tabular-nums">
                  {formatAmount(item.value)}
                  <span className="ml-1.5 text-xs text-muted-foreground">{pct}%</span>
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

// ─── Trades Tab ───

function TradesTab() {
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<TradeSchema | null>(null);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    ...listTradesV1InvestmentsTradesGetOptions({ client, query: { page, limit } }),
    placeholderData: keepPreviousData,
  });

  const queryKey = listTradesV1InvestmentsTradesGetQueryKey({ client });

  const deleteMutation = useMutation({
    ...deleteTradeV1InvestmentsTradesTradeIdDeleteMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({
        queryKey: getHoldingsV1InvestmentsHoldingsGetOptions({ client }).queryKey,
      });
      toast.success("Trade deleted");
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error("Failed to delete trade");
    },
  });

  const columns: ColumnDef<TradeSchema>[] = [
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
        const total = (row.original.quantity * row.original.price_per_unit) / 1_000_000;
        return <div className="text-right font-mono tabular-nums">{formatAmount(total)}</div>;
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
        <span className="block truncate text-muted-foreground">{row.original.notes ?? ""}</span>
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
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteTarget(row.original)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      ),
    },
  ];

  const trades = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <CreateTradeDialog />
      </div>

      {isLoading ? null : trades.length === 0 ? (
        <Empty className="border">
          <EmptyMedia ><TrendingUp /></EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No trades yet</EmptyTitle>
            <EmptyDescription>Record your first trade to see it here.</EmptyDescription>
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete trade?</AlertDialogTitle>
            <AlertDialogDescription>
              This trade will be permanently removed. This can&rsquo;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate({ client, path: { trade_id: deleteTarget.id } });
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

// ─── Securities Tab ───

function SecuritiesTab() {
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<SecuritySchema | null>(null);
  const [search, setSearch] = useState("");
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    ...listSecuritiesV1InvestmentsSecuritiesGetOptions({ client, query: { page, limit } }),
    placeholderData: keepPreviousData,
  });

  const queryKey = listSecuritiesV1InvestmentsSecuritiesGetQueryKey({ client });

  const deleteMutation = useMutation({
    ...deleteSecurityV1InvestmentsSecuritiesSecurityIdDeleteMutation({ client }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({
        queryKey: getHoldingsV1InvestmentsHoldingsGetOptions({ client }).queryKey,
      });
      toast.success("Security deleted");
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error("Failed to delete security");
    },
  });

  const columns: ColumnDef<SecuritySchema>[] = [
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "ticker",
      header: "Ticker",
      size: 100,
      cell: ({ row }) => row.original.ticker ?? "—",
    },
    {
      accessorKey: "asset_type",
      header: "Type",
      size: 120,
      cell: ({ row }) => (
        <span className="capitalize">{row.original.asset_type.replace("_", " ")}</span>
      ),
    },
    {
      accessorKey: "currency",
      header: "Currency",
      size: 80,
    },
    {
      id: "actions",
      size: 130,
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-0.5">
          <UpdatePriceDialog security={row.original} />
          <EditSecurityDialog security={row.original} />
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const allSecurities = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;
  const securities = search
    ? allSecurities.filter(
        (s) =>
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          (s.ticker && s.ticker.toLowerCase().includes(search.toLowerCase())),
      )
    : allSecurities;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search securities..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <CreateSecurityDialog />
      </div>

      {isLoading ? null : securities.length === 0 ? (
        <Empty className="border">
          <EmptyMedia ><TrendingUp /></EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No securities</EmptyTitle>
            <EmptyDescription>Add a security to start tracking your portfolio.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <DataTable columns={columns} data={securities} />
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete security?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; and all its trades and prices will be permanently
              removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleteTarget) return;
                deleteMutation.mutate({ client, path: { security_id: deleteTarget.id } });
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
