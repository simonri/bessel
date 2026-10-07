import type { SecuritySchema } from "@bessel/client";
import {
  deleteSecurityV1InvestmentsSecuritiesSecurityIdDeleteMutation,
  getHoldingsV1InvestmentsHoldingsGetOptions,
  listSecuritiesV1InvestmentsSecuritiesGetOptions,
  listSecuritiesV1InvestmentsSecuritiesGetQueryKey,
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
import { Search, Trash2, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { CreateSecurityDialog } from "@/components/create-security-dialog";
import { DataTable } from "@/components/data-table";
import { EditSecurityDialog } from "@/components/edit-security-dialog";
import {
  EmptyState,
  IconButton,
  PeriodNav,
  TextInput,
} from "@/components/ui-kit";
import { UpdatePriceDialog } from "@/components/update-price-dialog";
import { client } from "@/lib/client";

export function SecuritiesTab() {
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<SecuritySchema | null>(null);
  const [search, setSearch] = useState("");
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    ...listSecuritiesV1InvestmentsSecuritiesGetOptions({
      client,
      query: { page, limit },
    }),
    placeholderData: keepPreviousData,
  });

  const queryKey = listSecuritiesV1InvestmentsSecuritiesGetQueryKey({ client });

  const deleteMutation = useMutation({
    ...deleteSecurityV1InvestmentsSecuritiesSecurityIdDeleteMutation({
      client,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({
        queryKey: getHoldingsV1InvestmentsHoldingsGetOptions({ client })
          .queryKey,
      });
      // Its trades are deleted with it.
      void queryClient.invalidateQueries({
        queryKey: listTradesV1InvestmentsTradesGetQueryKey({ client }),
      });
      toast.success("Security deleted");
      setDeleteTarget(null);
    },
    onError: () => {
      toast.error("Failed to delete security");
    },
  });

  // Stable identity so react-table doesn't rebuild its column model per render.
  const columns: ColumnDef<SecuritySchema>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <span className="block truncate font-medium text-white/85">
            {row.original.name}
          </span>
        ),
      },
      {
        accessorKey: "ticker",
        header: "Ticker",
        size: 100,
        cell: ({ row }) =>
          row.original.ticker ? (
            <span className="text-12 tracking-wide text-white/70">
              {row.original.ticker}
            </span>
          ) : (
            <span className="text-white/30">—</span>
          ),
      },
      {
        accessorKey: "asset_type",
        header: "Type",
        size: 120,
        cell: ({ row }) => (
          <span className="text-white/55 capitalize">
            {row.original.asset_type.replace("_", " ")}
          </span>
        ),
      },
      {
        accessorKey: "currency",
        header: "Currency",
        size: 80,
        cell: ({ row }) => (
          <span className="text-12 text-white/45">{row.original.currency}</span>
        ),
      },
      {
        id: "actions",
        size: 130,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <UpdatePriceDialog security={row.original} />
            <EditSecurityDialog security={row.original} />
            <IconButton
              destructive
              title="Delete security"
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
        <div className="relative min-w-0 max-w-xs flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-white/35" />
          <TextInput
            placeholder="Search securities…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <CreateSecurityDialog />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-10 w-full rounded-lg bg-white/[0.06]"
            />
          ))}
        </div>
      ) : securities.length === 0 ? (
        <EmptyState icon={<TrendingUp />} title="No securities">
          {search
            ? "No securities match your search."
            : "Add a security to start tracking your portfolio."}
        </EmptyState>
      ) : (
        <DataTable columns={columns} data={securities} />
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
        title="Delete security?"
        description={
          <>
            &ldquo;{deleteTarget?.name}&rdquo; and all its trades and prices
            will be permanently removed.
          </>
        }
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate({
            client,
            path: { security_id: deleteTarget.id },
          });
        }}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
