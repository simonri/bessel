import { memo, useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { format } from "date-fns";
import { MoreHorizontal, Trash2 } from "lucide-react";
import type { TransactionSchema } from "@metron/client";
import {
  listTransactionsV1TransactionsGetInfiniteOptions,
  listTransactionsV1TransactionsGetQueryKey,
  listCategoriesV1CategoriesGetOptions,
  listBankAccountsV1BankAccountsGetOptions,
  deleteTransactionsV1TransactionsDeleteMutation,
  categorizeByDescriptionV1TransactionsCategorizeByDescriptionPostMutation,
} from "@metron/client";
import { Button } from "@metron/ui/components/button";
import { Checkbox } from "@metron/ui/components/checkbox";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@metron/ui/components/dropdown-menu";
import { VirtualDataTable } from "@/components/virtual-data-table";
import { ImportDialog } from "@/components/import-dialog";
import { CategoryCell, type BulkSuggestion } from "@/components/category-cell";
import {
  TransactionFiltersPopover,
  ActiveFilters,
  type TransactionFilters,
} from "@/components/transaction-filters";
import { toast } from "sonner";
import { client } from "@/lib/client";

export const Route = createFileRoute("/_app/transactions")({
  component: Transactions,
});

const PAGE_SIZE = 50;

const TransactionActions = memo(function TransactionActions({
  id,
  onDelete,
}: {
  id: string;
  onDelete: (ids: string[]) => void;
}) {
  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-destructive" onClick={() => onDelete([id])}>
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

function Transactions() {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkSuggestion, setBulkSuggestion] = useState<BulkSuggestion | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>({});
  const queryClient = useQueryClient();

  const handleFiltersChange = useCallback((next: TransactionFilters) => {
    setFilters(next);
    setRowSelection({});
  }, []);

  const {
    data: infiniteData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    ...listTransactionsV1TransactionsGetInfiniteOptions({
      client,
      query: {
        limit: PAGE_SIZE,
        sorting: ["-transaction_date", "description"],
        ...filters,
        date_from: filters.date_from ? new Date(filters.date_from + "T00:00:00") : undefined,
        date_to: filters.date_to ? new Date(filters.date_to + "T00:00:00") : undefined,
      },
    }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      const currentPage = typeof lastPageParam === "number" ? lastPageParam : 1;
      if (currentPage >= lastPage.pagination.max_page) return undefined;
      return currentPage + 1;
    },
  });

  const { data: categoriesData } = useQuery(
    listCategoriesV1CategoriesGetOptions({
      client,
      query: { limit: 200 },
    }),
  );
  const categories = categoriesData?.items ?? [];

  const { data: accountsData } = useQuery(
    listBankAccountsV1BankAccountsGetOptions({
      client,
      query: { limit: 100 },
    }),
  );
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of accountsData?.items ?? []) {
      map.set(acc.id, acc.name);
    }
    return map;
  }, [accountsData]);

  const queryKey = listTransactionsV1TransactionsGetQueryKey({ client });

  const deleteMutation = useMutation({
    ...deleteTransactionsV1TransactionsDeleteMutation({ client }),
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      const idsToDelete = new Set(body.ids);
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.filter((t: any) => !idsToDelete.has(t.id)),
            pagination: {
              ...page.pagination,
              total_count: page.pagination.total_count - idsToDelete.size,
            },
          })),
        };
      });
      setRowSelection({});
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Failed to delete transactions");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const bulkCategorizeMutation = useMutation({
    ...categorizeByDescriptionV1TransactionsCategorizeByDescriptionPostMutation({ client }),
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            items: page.items.map((t: any) =>
              t.description === body.description ? { ...t, category_id: body.category_id } : t,
            ),
          })),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, data] of context.previous) {
          queryClient.setQueryData(key, data);
        }
      }
      toast.error("Failed to categorize transactions");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      setBulkSuggestion(null);
    },
  });

  const handleDeleteRows = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      deleteMutation.mutate({ body: { ids } });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutate is stable
    [deleteMutation.mutate],
  );

  const handleBulkSuggestion = useCallback((info: BulkSuggestion) => {
    setBulkSuggestion(info);
  }, []);

  const handleConfirmBulk = () => {
    if (!bulkSuggestion) return;
    bulkCategorizeMutation.mutate({
      client,
      body: {
        description: bulkSuggestion.description,
        category_id: bulkSuggestion.categoryId,
      },
    });
  };

  const columns: ColumnDef<TransactionSchema>[] = [
    {
      id: "select",
      size: 40,
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
      size: 80,
      header: "Date",
      cell: ({ row }) => format(row.original.transaction_date, "MMM d"),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => (
        <span className="block truncate">{row.original.description ?? "\u2014"}</span>
      ),
    },
    {
      id: "account",
      size: 120,
      header: "Account",
      cell: ({ row }) => (
        <span className="text-muted-foreground truncate text-xs">
          {accountMap.get(row.original.bank_account_id) ?? "\u2014"}
        </span>
      ),
    },
    {
      id: "category",
      size: 160,
      header: "Category",
      cell: ({ row }) => (
        <CategoryCell
          transactionId={row.original.id}
          categoryId={row.original.category_id}
          description={row.original.description}
          categories={categories}
          onBulkSuggestion={handleBulkSuggestion}
        />
      ),
    },
    {
      accessorKey: "amount",
      size: 120,
      header: () => <div className="text-right">Amount</div>,
      cell: ({ row }) => {
        const amount = row.original.amount / 100;
        const sign = row.original.direction === "debit" ? "-" : "+";
        return (
          <div
            className={`text-right font-mono tabular-nums ${row.original.direction === "credit" ? "text-green-600" : "text-red-600"}`}
          >
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
      size: 60,
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => <TransactionActions id={row.original.id} onDelete={handleDeleteRows} />,
    },
  ];

  const transactions = useMemo(
    () => infiniteData?.pages.flatMap((p) => p.items) ?? [],
    [infiniteData],
  );
  const totalCount = infiniteData?.pages[0]?.pagination.total_count ?? 0;
  const selectedCount = Object.keys(rowSelection).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Transactions</h2>
          {totalCount > 0 && (
            <p className="text-muted-foreground text-sm">
              {totalCount} transaction{totalCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <TransactionFiltersPopover
            filters={filters}
            onFiltersChange={handleFiltersChange}
            accounts={accountsData?.items ?? []}
            categories={categories}
          />
          <ImportDialog />
        </div>
      </div>
      <ActiveFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        accounts={accountsData?.items ?? []}
        categories={categories}
      />

      {isLoading ? (
        <div className="text-muted-foreground flex h-24 items-center justify-center">
          Loading...
        </div>
      ) : (
        <>
          <VirtualDataTable
            columns={columns}
            data={transactions}
            getRowId={(row) => row.id}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            onEndReached={fetchNextPage}
            hasMore={hasNextPage}
            isFetchingMore={isFetchingNextPage}
          />

          {selectedCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {selectedCount} row{selectedCount !== 1 ? "s" : ""} selected
              </span>
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
          )}
        </>
      )}

      <AlertDialog
        open={!!bulkSuggestion}
        onOpenChange={(open) => !open && setBulkSuggestion(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply category to similar transactions?</AlertDialogTitle>
            <AlertDialogDescription>
              {bulkSuggestion?.count} other transaction{bulkSuggestion?.count !== 1 ? "s" : ""} with
              description &ldquo;{bulkSuggestion?.description}&rdquo; can be categorized as{" "}
              <strong>{bulkSuggestion?.categoryName}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No thanks</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmBulk}
              disabled={bulkCategorizeMutation.isPending}
            >
              {bulkCategorizeMutation.isPending
                ? "Applying..."
                : `Apply to ${bulkSuggestion?.count} transaction${bulkSuggestion?.count !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
