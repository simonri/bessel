import type { BankAccountSchema } from "@metron/client";
import {
  deleteBankAccountV1BankAccountsBankAccountIdDeleteMutation,
  listBankAccountsV1BankAccountsGetOptions,
  listBankAccountsV1BankAccountsGetQueryKey,
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
import { Skeleton } from "@metron/ui/components/skeleton";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { CreateAccountDialog } from "@/components/create-account-dialog";
import { EditAccountDialog } from "@/components/edit-account-dialog";
import { VirtualDataTable } from "@/components/virtual-data-table";
import { client } from "@/lib/client";
import { formatMoney } from "@/lib/money";

export const Route = createFileRoute("/_app/accounts")({
  component: Accounts,
});

const PAGE_SIZE = 50;

function Accounts() {
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<BankAccountSchema | null>(
    null,
  );
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    ...listBankAccountsV1BankAccountsGetOptions({
      client,
      query: { limit: PAGE_SIZE, page, sorting: ["name"] },
    }),
    placeholderData: keepPreviousData,
  });

  const queryKey = listBankAccountsV1BankAccountsGetQueryKey({ client });

  const deleteMutation = useMutation({
    ...deleteBankAccountV1BankAccountsBankAccountIdDeleteMutation({ client }),
    onMutate: async ({ path }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.filter((a: any) => a.id !== path.bank_account_id),
          pagination: {
            ...old.pagination,
            total_count: old.pagination.total_count - 1,
          },
        };
      });
      setDeleteTarget(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, val] of context.previous)
          queryClient.setQueryData(key, val);
      }
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  // Stable identity so react-table doesn't rebuild its column model per render.
  const columns: ColumnDef<BankAccountSchema>[] = useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
      },
      {
        accessorKey: "subtype",
        size: 100,
        header: "Type",
        cell: ({ row }) => (
          <span className="capitalize">{row.original.subtype}</span>
        ),
      },
      {
        accessorKey: "currency",
        size: 80,
        header: "Currency",
      },
      {
        accessorKey: "current_balance",
        size: 140,
        header: () => <div className="text-right">Balance</div>,
        cell: ({ row }) => (
          <div className="text-right font-mono tabular-nums">
            {formatMoney(
              row.original.current_balance ?? 0,
              row.original.currency,
            )}
          </div>
        ),
      },
      {
        accessorKey: "created_at",
        size: 120,
        header: "Created",
        cell: ({ row }) => format(row.original.created_at, "yyyy-MM-dd"),
      },
      {
        id: "actions",
        size: 90,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <EditAccountDialog account={row.original} />
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
    ],
    [],
  );

  const accounts = data?.items ?? [];
  const totalCount = data?.pagination.total_count ?? 0;
  const maxPage = data?.pagination.max_page ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Accounts</h2>
          {totalCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {totalCount} account{totalCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <CreateAccountDialog />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <VirtualDataTable
          columns={columns}
          data={accounts}
          getRowId={(row) => row.id}
          emptyMessage="No accounts yet."
        />
      )}

      {maxPage > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {page} / {maxPage}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
            disabled={page >= maxPage}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; and all its transactions will
              be permanently removed. This can&rsquo;t be undone.
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
                  path: { bank_account_id: deleteTarget.id },
                });
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
