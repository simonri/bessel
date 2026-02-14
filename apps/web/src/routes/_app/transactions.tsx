import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, MoreHorizontal, Trash2 } from "lucide-react";
import type { TransactionSchema } from "@metron/client";
import {
  listTransactionsV1TransactionsGetOptions,
  listTransactionsV1TransactionsGetQueryKey,
  deleteTransactionsV1TransactionsDeleteMutation,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
import { Checkbox } from "@metron/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metron/ui/components/dropdown-menu";
import { DataTable } from "@/components/data-table";
import { ImportDialog } from "@/components/import-dialog";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/transactions")({
  component: Transactions,
});

function Transactions() {
  const [page, setPage] = useState(1);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(
    listTransactionsV1TransactionsGetOptions({
      client,
      query: {
        page,
        limit,
        sorting: ["-transaction_date"],
      },
    }),
  );

  const deleteMutation = useMutation({
    ...deleteTransactionsV1TransactionsDeleteMutation({ client }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: listTransactionsV1TransactionsGetQueryKey(),
      });
      setRowSelection({});
    },
  });

  const handleDeleteRows = (ids: string[]) => {
    if (ids.length === 0) return;
    deleteMutation.mutate({ body: { ids } });
  };

  const columns: ColumnDef<TransactionSchema>[] = [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "transaction_date",
      header: "Date",
      cell: ({ row }) => format(row.original.transaction_date, "MMM d"),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="max-w-[300px] truncate">
          {row.original.description ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: () => <div className="text-right">Amount</div>,
      cell: ({ row }) => {
        const amount = row.original.amount / 100;
        const sign = row.original.direction === "debit" ? "-" : "+";
        return (
          <div className="text-right font-mono tabular-nums">
            {sign}
            {Math.abs(amount).toLocaleString("sv-SE", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => (
        <div className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => handleDeleteRows([row.original.id])}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      ),
    },
  ];

  const transactions = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;
  const totalCount = data?.pagination.total_count ?? 0;
  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
          {totalCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {totalCount} transaction{totalCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <ImportDialog />
      </div>

      {isLoading ? (
        <div className="text-muted-foreground flex h-24 items-center justify-center">
          Loading...
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={transactions}
            getRowId={(row) => row.id}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
          />

          <div className="flex items-center justify-between">
            <div className="text-muted-foreground text-sm">
              {selectedCount > 0 ? (
                <div className="flex items-center gap-2">
                  <span>{selectedCount} row{selectedCount !== 1 ? "s" : ""} selected</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteRows(Object.keys(rowSelection))}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </Button>
                </div>
              ) : null}
            </div>

            {maxPage > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
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
                  disabled={page >= maxPage}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
