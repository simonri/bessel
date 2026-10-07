import type { BankAccountSchema } from "@bessel/client";
import {
  deleteBankAccountV1BankAccountsBankAccountIdDeleteMutation,
  listBankAccountsV1BankAccountsGetOptions,
  listBankAccountsV1BankAccountsGetQueryKey,
  listTradesV1InvestmentsTradesGetQueryKey,
  listTransactionsV1TransactionsGetQueryKey,
} from "@bessel/client";
import { Skeleton } from "@bessel/ui/components/skeleton";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/confirm-delete-dialog";
import { CreateAccountDialog } from "@/components/create-account-dialog";
import { EditAccountDialog } from "@/components/edit-account-dialog";
import { IconButton, PageToolbar, PeriodNav } from "@/components/ui-kit";
import { VirtualDataTable } from "@/components/virtual-data-table";
import { errorDetail } from "@/lib/api-error";
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
    onError: (error, _vars, context) => {
      if (context?.previous) {
        for (const [key, val] of context.previous)
          queryClient.setQueryData(key, val);
      }
      toast.error(errorDetail(error, "Couldn't delete the account"));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      // Deleting an account deletes its transactions and trades with it.
      void queryClient.invalidateQueries({
        queryKey: listTransactionsV1TransactionsGetQueryKey({ client }),
      });
      void queryClient.invalidateQueries({
        queryKey: listTradesV1InvestmentsTradesGetQueryKey({ client }),
      });
    },
  });

  // Stable identity so react-table doesn't rebuild its column model per render.
  const columns: ColumnDef<BankAccountSchema>[] = useMemo(
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
        accessorKey: "subtype",
        size: 100,
        header: "Type",
        cell: ({ row }) => (
          <span className="text-white/55 capitalize">
            {row.original.subtype}
          </span>
        ),
      },
      {
        accessorKey: "currency",
        size: 80,
        header: "Currency",
        cell: ({ row }) => (
          <span className="text-12 text-white/45">{row.original.currency}</span>
        ),
      },
      {
        accessorKey: "current_balance",
        size: 140,
        header: () => <div className="text-right">Balance</div>,
        cell: ({ row }) => (
          <div className="text-right font-medium tabular-nums text-white/85">
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
        cell: ({ row }) => (
          <span className="text-12 tabular-nums text-white/45">
            {format(row.original.created_at, "yyyy-MM-dd")}
          </span>
        ),
      },
      {
        id: "actions",
        size: 90,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <EditAccountDialog account={row.original} />
            <IconButton
              destructive
              title="Delete account"
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

  const accounts = data?.items ?? [];
  const totalCount = data?.pagination.total_count ?? 0;
  const maxPage = data?.pagination.max_page ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <PageToolbar
        description={
          totalCount > 0 && (
            <span className="tabular-nums">
              {totalCount} account{totalCount !== 1 ? "s" : ""}
            </span>
          )
        }
      >
        <CreateAccountDialog />
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
      ) : (
        <VirtualDataTable
          columns={columns}
          data={accounts}
          getRowId={(row) => row.id}
          emptyMessage="No accounts yet."
        />
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
        title="Delete account?"
        description={
          <>
            &ldquo;{deleteTarget?.name}&rdquo; and all its transactions will be
            permanently removed. This can&rsquo;t be undone.
          </>
        }
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteMutation.mutate({
            client,
            path: { bank_account_id: deleteTarget.id },
          });
        }}
        isPending={deleteMutation.isPending}
        pendingLabel="Deleting…"
      />
    </div>
  );
}
