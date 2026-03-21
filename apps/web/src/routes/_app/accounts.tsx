import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import type { BankAccountSchema } from "@metron/client";
import {
  listBankAccountsV1BankAccountsGetInfiniteOptions,
  listBankAccountsV1BankAccountsGetQueryKey,
  deleteBankAccountV1BankAccountsBankAccountIdDeleteMutation,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
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
import { VirtualDataTable } from "@/components/virtual-data-table";
import { CreateAccountDialog } from "@/components/create-account-dialog";
import { EditAccountDialog } from "@/components/edit-account-dialog";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/accounts")({
  component: Accounts,
});

const PAGE_SIZE = 50;

function Accounts() {
  const [deleteTarget, setDeleteTarget] = useState<BankAccountSchema | null>(null);
  const queryClient = useQueryClient();

  const {
    data: infiniteData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...listBankAccountsV1BankAccountsGetInfiniteOptions({
      client,
      query: {
        limit: PAGE_SIZE,
        sorting: ["name"],
      },
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const currentPage = typeof lastPageParam === "number" ? lastPageParam : 1;
      if (currentPage >= lastPage.pagination.max_page) return undefined;
      return currentPage + 1;
    },
  });

  const queryKey = listBankAccountsV1BankAccountsGetQueryKey({ client });

  const deleteMutation = useMutation({
    ...deleteBankAccountV1BankAccountsBankAccountIdDeleteMutation({ client }),
    onMutate: async ({ path }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.filter((a: any) => a.id !== path.bank_account_id),
            pagination: {
              ...page.pagination,
              total_count: page.pagination.total_count - 1,
            },
          })),
        };
      });
      setDeleteTarget(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const columns: ColumnDef<BankAccountSchema>[] = [
    {
      accessorKey: "name",
      header: "Name",
    },
    {
      accessorKey: "subtype",
      size: 100,
      header: "Type",
      cell: ({ row }) => <span className="capitalize">{row.original.subtype}</span>,
    },
    {
      accessorKey: "currency",
      size: 80,
      header: "Currency",
    },
    {
      accessorKey: "current_balance",
      size: 120,
      header: () => <div className="text-right">Balance</div>,
      cell: ({ row }) => {
        const amount = (row.original.current_balance ?? 0) / 100;
        return (
          <div className="text-right font-mono tabular-nums">
            {amount.toLocaleString("sv-SE", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        );
      },
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
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteTarget(row.original)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const accounts = useMemo(() => infiniteData?.pages.flatMap((p) => p.items) ?? [], [infiniteData]);
  const totalCount = infiniteData?.pages[0]?.pagination.total_count ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
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
        <div className="text-muted-foreground flex h-24 items-center justify-center">
          Loading...
        </div>
      ) : (
        <VirtualDataTable
          columns={columns}
          data={accounts}
          getRowId={(row) => row.id}
          emptyMessage="No accounts yet."
          onEndReached={fetchNextPage}
          hasMore={hasNextPage}
          isFetchingMore={isFetchingNextPage}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{deleteTarget?.name}&rdquo; and all its transactions will be permanently
              removed. This can&rsquo;t be undone.
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
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
