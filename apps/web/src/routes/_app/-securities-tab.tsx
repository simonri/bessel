import type { SecuritySchema } from "@metron/client";
import {
  deleteSecurityV1InvestmentsSecuritiesSecurityIdDeleteMutation,
  getHoldingsV1InvestmentsHoldingsGetOptions,
  listSecuritiesV1InvestmentsSecuritiesGetOptions,
  listSecuritiesV1InvestmentsSecuritiesGetQueryKey,
} from "@metron/client";
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
import { Button } from "@metron/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@metron/ui/components/empty";
import { Input } from "@metron/ui/components/input";
import { Skeleton } from "@metron/ui/components/skeleton";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Search, Trash2, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CreateSecurityDialog } from "@/components/create-security-dialog";
import { DataTable } from "@/components/data-table";
import { EditSecurityDialog } from "@/components/edit-security-dialog";
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
        <span className="capitalize">
          {row.original.asset_type.replace("_", " ")}
        </span>
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
            className="hover:text-destructive"
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

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : securities.length === 0 ? (
        <Empty className="border">
          <EmptyMedia>
            <TrendingUp />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No securities</EmptyTitle>
            <EmptyDescription>
              Add a security to start tracking your portfolio.
            </EmptyDescription>
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

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete security?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; and all its trades and prices
              will be permanently removed.
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
                  path: { security_id: deleteTarget.id },
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
