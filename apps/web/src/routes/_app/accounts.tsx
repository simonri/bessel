import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { BankAccountSchema } from "@metron/client";
import { listBankAccountsV1BankAccountsGetOptions } from "@metron/client";
import { Button } from "@metron/ui/components/button";
import { DataTable } from "@/components/data-table";
import { CreateAccountDialog } from "@/components/create-account-dialog";
import { EditAccountDialog } from "@/components/edit-account-dialog";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/accounts")({
  component: Accounts,
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
    size: 120,
    header: () => <div className="text-right">Balance</div>,
    cell: ({ row }) => {
      const amount = row.original.current_balance / 100;
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
    size: 60,
    cell: ({ row }) => (
      <div className="text-right">
        <EditAccountDialog account={row.original} />
      </div>
    ),
  },
];

function Accounts() {
  const [page, setPage] = useState(1);
  const limit = 20;

  const { data, isLoading, isPlaceholderData } = useQuery({
    ...listBankAccountsV1BankAccountsGetOptions({
      client,
      query: {
        page,
        limit,
        sorting: ["name"],
      },
    }),
    placeholderData: keepPreviousData,
  });

  const accounts = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;
  const totalCount = data?.pagination.total_count ?? 0;

  return (
    <div className="space-y-6">
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
        <>
          <div className={isPlaceholderData ? "opacity-50 transition-opacity" : "transition-opacity"}>
            <DataTable columns={columns} data={accounts} />
          </div>

          {maxPage > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isPlaceholderData}
              >
                <ChevronLeft className="size-4" />
                Previous
              </Button>
              <span className="text-muted-foreground text-sm">
                Page {page} of {maxPage}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(maxPage, p + 1))}
                disabled={page >= maxPage || isPlaceholderData}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
