import type { TransactionSchema } from "@bessel/client";
import {
  bulkUpdateTransactionsV1TransactionsBulkPatchMutation,
  categorizeByDescriptionV1TransactionsCategorizeByDescriptionPostMutation,
  deleteTransactionsV1TransactionsDeleteMutation,
  listBankAccountsV1BankAccountsGetOptions,
  listCategoriesV1CategoriesGetOptions,
  listTransactionsV1TransactionsGetOptions,
  listTransactionsV1TransactionsGetQueryKey,
  updateTransactionV1TransactionsTransactionIdPatchMutation,
} from "@bessel/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@bessel/ui/components/alert-dialog";
import { Button } from "@bessel/ui/components/button";
import { Checkbox } from "@bessel/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bessel/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@bessel/ui/components/empty";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@bessel/ui/components/popover";
import { Skeleton } from "@bessel/ui/components/skeleton";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { format, isToday, isYesterday } from "date-fns";
import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Tag,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { type BulkSuggestion, CategoryCell } from "@/components/category-cell";
import { ImportDialog } from "@/components/import-dialog";
import {
  type TransactionFilters,
  TransactionFiltersBar,
} from "@/components/transaction-filters";
import { VirtualDataTable } from "@/components/virtual-data-table";
import { client } from "@/lib/client";
import { formatAmount } from "@/lib/money";

// ─── Route + URL search params ────────────────────────────────────────────────

function parseFilters(raw: Record<string, unknown>): TransactionFilters {
  const asArr = (v: unknown): string[] | undefined => {
    if (Array.isArray(v))
      return v.filter((x): x is string => typeof x === "string");
    if (typeof v === "string") return [v];
    return undefined;
  };
  const asInt = (v: unknown): number | undefined => {
    const n =
      typeof v === "string"
        ? Number.parseInt(v, 10)
        : typeof v === "number"
          ? v
          : Number.NaN;
    return isNaN(n) ? undefined : n;
  };
  return {
    bank_account_id: asArr(raw.bank_account_id),
    category_id: asArr(raw.category_id),
    uncategorized:
      raw.uncategorized === "true" || raw.uncategorized === true
        ? true
        : undefined,
    direction: typeof raw.direction === "string" ? raw.direction : undefined,
    is_business:
      raw.is_business === "true" || raw.is_business === true ? true : undefined,
    search: typeof raw.search === "string" ? raw.search : undefined,
    year: asInt(raw.year),
    month: asInt(raw.month),
  };
}

export const Route = createFileRoute("/_app/transactions")({
  validateSearch: (raw) => parseFilters(raw),
  component: Transactions,
});

const MONTH_LIMIT = 500;

// ─── Date group label ─────────────────────────────────────────────────────────

function toLocalDateStr(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  return format(d, "yyyy-MM-dd");
}

function getDateGroupLabel(
  tx: TransactionSchema,
  prev: TransactionSchema | undefined,
): string | null {
  const dateStr = toLocalDateStr(tx.transaction_date);
  const prevStr = prev ? toLocalDateStr(prev.transaction_date) : null;
  if (dateStr === prevStr) return null;

  const d = new Date(dateStr + "T00:00:00");
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEE, MMM d");
}

// ─── Actions cell ─────────────────────────────────────────────────────────────

const TransactionActions = memo(function TransactionActions({
  id,
  isBusiness,
  onDelete,
  onToggleBusiness,
}: {
  id: string;
  isBusiness: boolean;
  onDelete: (ids: string[]) => void;
  onToggleBusiness: (id: string, value: boolean) => void;
}) {
  return (
    <div className="text-right">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onToggleBusiness(id, !isBusiness)}>
            {isBusiness
              ? "Remove business expense"
              : "Mark as business expense"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => onDelete([id])}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});

// ─── Page ─────────────────────────────────────────────────────────────────────

function Transactions() {
  const now = new Date();
  const [filters, setFilters] = useState<TransactionFilters>({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [bulkSuggestion, setBulkSuggestion] = useState<BulkSuggestion | null>(
    null,
  );
  const queryClient = useQueryClient();

  const year = filters.year ?? now.getFullYear();
  const month = filters.month ?? now.getMonth() + 1;
  const firstDay = new Date(year, month - 1, 1);
  const mm = String(month).padStart(2, "0");
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayStr = `${year}-${mm}-01`;
  const lastDayStr = `${year}-${mm}-${String(daysInMonth).padStart(2, "0")}`;
  const isCurrentMonth =
    year === now.getFullYear() && month === now.getMonth() + 1;

  const navigateMonth = useCallback(
    (delta: -1 | 1) => {
      const newMonth = month + delta;
      const newYear = newMonth < 1 ? year - 1 : newMonth > 12 ? year + 1 : year;
      const clampedMonth = newMonth < 1 ? 12 : newMonth > 12 ? 1 : newMonth;
      const next: TransactionFilters = { year: newYear, month: clampedMonth };
      for (const [k, v] of Object.entries(filters)) {
        if (k === "year" || k === "month") continue;
        if (v === undefined || v === null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        (next as Record<string, unknown>)[k] = v;
      }
      setFilters(next);
      setRowSelection({});
    },
    [year, month, filters],
  );

  const handleFiltersChange = useCallback(
    (next: TransactionFilters) => {
      const clean: TransactionFilters = { year, month };
      for (const [k, v] of Object.entries(next)) {
        if (k === "year" || k === "month") continue;
        if (v === undefined || v === null) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        (clean as Record<string, unknown>)[k] = v;
      }
      setFilters(clean);
      setRowSelection({});
    },
    [year, month],
  );

  const { data, isLoading } = useQuery({
    ...listTransactionsV1TransactionsGetOptions({
      client,
      query: {
        limit: MONTH_LIMIT,
        page: 1,
        sorting: ["-transaction_date", "description"],
        bank_account_id: filters.bank_account_id,
        category_id: filters.category_id,
        uncategorized: filters.uncategorized,
        direction: filters.direction,
        is_business: filters.is_business,
        search: filters.search,
        date_from: firstDayStr as unknown as Date,
        date_to: lastDayStr as unknown as Date,
      },
    }),
    placeholderData: keepPreviousData,
  });

  const { data: categoriesData } = useQuery(
    listCategoriesV1CategoriesGetOptions({
      client,
      query: { limit: 200 },
    }),
  );
  const categories = useMemo(
    () => categoriesData?.items ?? [],
    [categoriesData],
  );

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
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.filter((t: any) => !idsToDelete.has(t.id)),
          pagination: {
            ...old.pagination,
            total_count: old.pagination.total_count - idsToDelete.size,
          },
        };
      });
      setRowSelection({});
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, val] of context.previous)
          queryClient.setQueryData(key, val);
      }
      toast.error("Failed to delete transactions");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const bulkUpdateMutation = useMutation({
    ...bulkUpdateTransactionsV1TransactionsBulkPatchMutation({ client }),
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      const idSet = new Set(body.ids);
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t: any) =>
            idSet.has(t.id) ? { ...t, category_id: body.category_id } : t,
          ),
        };
      });
      setRowSelection({});
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, val] of context.previous)
          queryClient.setQueryData(key, val);
      }
      toast.error("Failed to categorize transactions");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const bulkCategorizeMutation = useMutation({
    ...categorizeByDescriptionV1TransactionsCategorizeByDescriptionPostMutation(
      { client },
    ),
    onMutate: async ({ body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t: any) =>
            t.description === body.description
              ? { ...t, category_id: body.category_id }
              : t,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, val] of context.previous)
          queryClient.setQueryData(key, val);
      }
      toast.error("Failed to categorize transactions");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
      setBulkSuggestion(null);
    },
  });

  const toggleBusinessMutation = useMutation({
    ...updateTransactionV1TransactionsTransactionIdPatchMutation({ client }),
    onMutate: async ({ path, body }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueriesData({ queryKey });
      queryClient.setQueriesData({ queryKey }, (old: any) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((t: any) =>
            t.id === path.transaction_id
              ? { ...t, is_business: body.is_business }
              : t,
          ),
        };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        for (const [key, val] of context.previous)
          queryClient.setQueryData(key, val);
      }
      toast.error("Failed to update transaction");
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey }),
  });

  const handleToggleBusiness = useCallback(
    (id: string, value: boolean) => {
      toggleBusinessMutation.mutate({
        client,
        path: { transaction_id: id },
        body: { is_business: value },
      });
    },
    [toggleBusinessMutation.mutate],
  );

  const handleDeleteRows = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      deleteMutation.mutate({ body: { ids } });
    },
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

  // Stable columns identity — a fresh array (with fresh cell closures) every
  // render forces react-table to rebuild its column model per keystroke in
  // the filters and re-render every cell.
  const columns: ColumnDef<TransactionSchema>[] = useMemo(
    () => [
      {
        id: "select",
        size: 40,
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) =>
              table.toggleAllPageRowsSelected(!!value)
            }
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
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => (
          <div className="flex items-center gap-2 min-w-0">
            <span className="truncate text-sm">
              {row.original.description ?? "—"}
            </span>
            {row.original.is_business && (
              <span className="shrink-0 inline-flex items-center rounded bg-chart-1 px-1.5 py-px text-10 font-semibold text-white">
                Business
              </span>
            )}
          </div>
        ),
      },
      {
        id: "account",
        size: 120,
        header: "Account",
        // hidden on mobile via meta — handled by className on TableCell below
        cell: ({ row }) => (
          <span className="text-muted-foreground hidden truncate text-xs sm:block">
            {accountMap.get(row.original.bank_account_id) ?? "—"}
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
          const amount = row.original.amount;
          const sign = row.original.direction === "debit" ? "−" : "+";
          return (
            <div
              className={`text-right font-mono tabular-nums text-sm ${
                row.original.direction === "credit"
                  ? "text-income"
                  : "text-expense"
              }`}
            >
              {sign}
              {formatAmount(amount)}
            </div>
          );
        },
      },
      {
        id: "actions",
        size: 48,
        header: () => null,
        cell: ({ row }) => (
          <div className="hidden sm:block">
            <TransactionActions
              id={row.original.id}
              isBusiness={row.original.is_business ?? false}
              onDelete={handleDeleteRows}
              onToggleBusiness={handleToggleBusiness}
            />
          </div>
        ),
      },
    ],
    [
      accountMap,
      categories,
      handleBulkSuggestion,
      handleDeleteRows,
      handleToggleBusiness,
    ],
  );

  const transactions = data?.items ?? [];
  const totalCount = data?.pagination.total_count ?? 0;
  const selectedCount = Object.keys(rowSelection).length;
  const monthLabel = format(firstDay, "MMMM yyyy");

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Transactions</h2>
        <ImportDialog />
      </div>

      {/* Month navigation */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigateMonth(-1)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="text-sm font-medium w-28 text-center tabular-nums">
          {monthLabel}
        </span>
        <button
          type="button"
          onClick={() => navigateMonth(1)}
          disabled={isCurrentMonth}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded disabled:opacity-25 disabled:cursor-not-allowed"
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </button>
        {totalCount > 0 && (
          <span className="text-muted-foreground text-sm pl-2">
            {totalCount} transaction{totalCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Inline filter bar */}
      <TransactionFiltersBar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        accounts={accountsData?.items ?? []}
        categories={categories}
      />

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : transactions.length === 0 ? (
        <Empty className="border">
          <EmptyMedia>
            <ArrowLeftRight />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No transactions</EmptyTitle>
            <EmptyDescription>
              {Object.keys(filters).length > 0
                ? "No transactions match your current filters."
                : "Import a bank export to get started."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <VirtualDataTable
            columns={columns}
            data={transactions}
            getRowId={(row) => row.id}
            rowSelection={rowSelection}
            onRowSelectionChange={setRowSelection}
            getGroupLabel={getDateGroupLabel}
          />

          {selectedCount > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">
                {selectedCount} row{selectedCount !== 1 ? "s" : ""} selected
              </span>

              {/* Bulk categorize */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkUpdateMutation.isPending}
                  >
                    <Tag className="size-4" />
                    Categorize
                    <ChevronDown className="size-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="max-h-72 w-56 overflow-y-auto p-1.5"
                >
                  <button
                    type="button"
                    className="hover:bg-accent text-muted-foreground w-full rounded-sm px-2 py-1.5 text-left text-sm italic"
                    onClick={() =>
                      bulkUpdateMutation.mutate({
                        client,
                        body: {
                          ids: Object.keys(rowSelection),
                          category_id: null,
                        },
                      })
                    }
                  >
                    None (clear)
                  </button>
                  {categories
                    .filter((c) => c.parent_id)
                    .map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        className="hover:bg-accent flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm"
                        onClick={() =>
                          bulkUpdateMutation.mutate({
                            client,
                            body: {
                              ids: Object.keys(rowSelection),
                              category_id: cat.id,
                            },
                          })
                        }
                      >
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        {cat.name}
                      </button>
                    ))}
                </PopoverContent>
              </Popover>

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

      {/* Bulk categorize suggestion dialog */}
      <AlertDialog
        open={!!bulkSuggestion}
        onOpenChange={(open) => !open && setBulkSuggestion(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apply category to similar transactions?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {bulkSuggestion?.count} other transaction
              {bulkSuggestion?.count !== 1 ? "s" : ""} with description &ldquo;
              {bulkSuggestion?.description}&rdquo; can be categorized as{" "}
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
                ? "Applying…"
                : `Apply to ${bulkSuggestion?.count} transaction${bulkSuggestion?.count !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
