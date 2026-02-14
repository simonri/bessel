import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TransactionSchema } from "@metron/client";
import { listTransactionsV1TransactionsGetOptions } from "@metron/client";
import { Badge } from "@metron/ui/components/badge";
import { Button } from "@metron/ui/components/button";
import { DataTable } from "@/components/data-table";
import { ImportDialog } from "@/components/import-dialog";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/transactions")({
  component: Transactions,
});

const columns: ColumnDef<TransactionSchema>[] = [
  {
    accessorKey: "transaction_date",
    header: "Date",
    cell: ({ row }) => format(row.original.transaction_date, "yyyy-MM-dd"),
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
    accessorKey: "currency",
    header: "Currency",
  },
  {
    accessorKey: "direction",
    header: "Direction",
    cell: ({ row }) => (
      <Badge variant={row.original.direction === "credit" ? "secondary" : "outline"}>
        {row.original.direction}
      </Badge>
    ),
  },
];

function Transactions() {
  const [page, setPage] = useState(1);
  const limit = 20;

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

  const transactions = data?.items ?? [];
  const maxPage = data?.pagination.max_page ?? 1;
  const totalCount = data?.pagination.total_count ?? 0;

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
          <DataTable columns={columns} data={transactions} />

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
        </>
      )}
    </div>
  );
}
